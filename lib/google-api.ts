/**
 * Google API Integration Module
 *
 * Handles all interactions with Google Sheets, Google Drive, and Gmail APIs.
 * Uses the official `googleapis` library with `requestBody` (not `resource`)
 * to work around a serialization bug that caused `{}` in cell A1.
 *
 * Key exports:
 *   - populateTemplate()   — Pure logic: fills a CSV template with role data
 *   - createAgendaSheet()  — Creates a new Google Sheet and makes it shareable
 *   - updateAgendaSheet()  — Updates an existing sheet with new role assignments
 *   - sendGmailAsUser()    — Sends email via Gmail API as the authenticated user
 *                            (a Toastmaster, or the club account)
 */
import { randomUUID } from 'crypto';
import { google, sheets_v4 } from 'googleapis';
import { formatMeetingMonthDay, formatClubDateTime } from './meeting-time';

// ---------- Template Population (pure logic, no API calls) ----------

/**
 * Placeholder written into the name column for agenda rows that are deliberately
 * not staffed by a person (Break Time, General Feedback slots).
 *
 * Distinct from 'TBD', which means "a real role that nobody has been assigned to
 * yet". A row whose roleMap entry is an empty string is unstaffed *by design* and
 * must render as '-', never as 'TBD'.
 */
const NO_PERSON = '-';

/**
 * Simple CSV row parser that handles quoted fields.
 */
function parseCSVRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { cells.push(current); current = ''; }
    else { current += char; }
  }
  cells.push(current);
  return cells;
}

export function populateTemplate(
  csvTemplate: string,
  theme: string,
  qotd: string,
  roleMap: Record<string, string>,
  unassignedNames: string[],
  // Rows for the CHANGELOG section, each starting at column B (see
  // buildChangelog). The template's own example and numbered lines are dropped.
  changelog: string[][] = [],
  // Guest Education Session with a guest name set: relabel the Speaker 3 row
  // as "Guest Speaker" on the output sheet. The roleMap already carries the
  // guest's name under 'Speaker 3' when this is true (see buildRoleMap()).
  guestEducationActive: boolean = false
): string[][] {
  // Parse each CSV row, then process template sections in order
  const rows = csvTemplate.split('\n')
    .map(line => line.replace(/\r$/, ''))  // Normalize CRLF to LF
    .filter(line => line.length > 0)       // Skip blank lines
    .map(line => parseCSVRow(line));

  // Row 0, col 1: inject the Question of the Day (or theme as fallback)
  if (rows[0]?.[1]) {
    rows[0][1] = rows[0][1].replace('[QUESTION HERE]', qotd || theme);
  }

  // Tracking flags for the three sections of the CSV template
  let inNoRolesSection = false;      // "No Roles" section: members attending without a role
  let inChangelogSection = false;    // "CHANGELOG" section: role swap audit trail
  let changelogStartIndex = -1;

  // Walk rows starting from row 2 (row 0 = header, row 1 = sub-header)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const roleLabel = (row[1] || '').trim();

    if (roleLabel.startsWith('No Roles')) { inNoRolesSection = true; continue; }
    if (roleLabel.startsWith('CHANGELOG')) { 
      inNoRolesSection = false; 
      inChangelogSection = true; 
      changelogStartIndex = i;
      continue; 
    }

    if (inChangelogSection) {
      continue;
    }

    if (inNoRolesSection) {
      for (let c = 1; c <= 4 && c < row.length; c++) {
        if ((row[c] || '').trim() === 'NAME') row[c] = '';
      }
      continue;
    }

    // Replace NAME placeholder in col 3 with the person assigned to the role in col 1
    if (row.length > 3 && (row[3] || '').trim() === 'NAME') {
      if (roleLabel.toLowerCase().includes('general feedback') || roleLabel.toLowerCase().includes('general feadback')) {
        row[3] = NO_PERSON;
      } else {
        const person = roleMap[roleLabel];
        if (person === undefined) {
          row[3] = 'TBD';        // a real role, nobody assigned to it yet
        } else if (person === '') {
          row[3] = NO_PERSON;    // unstaffed by design (e.g. Break Time)
        } else {
          row[3] = person;
        }
      }
    }

    // Label swap runs AFTER the name substitution above — 'Speaker 3' must
    // stay intact as the roleMap lookup key while the person is resolved.
    if (guestEducationActive && roleLabel === 'Speaker 3') {
      row[1] = row[1].replace('Speaker 3', 'Guest Speaker');
    }
  }

  // Fill the "No Roles" section with leftover attendee names
  if (unassignedNames.length > 0) {
    const idx = rows.findIndex(r => (r[1] || '').trim().startsWith('No Roles'));
    if (idx >= 0) {
      let ni = 0;
      for (let r = idx + 1; r < rows.length && ni < unassignedNames.length; r++) {
        if ((rows[r][1] || '').trim().startsWith('CHANGELOG')) break;
        for (let c = 1; c <= 4 && c < rows[r].length && ni < unassignedNames.length; c++) {
          if (!(rows[r][c] || '').trim()) rows[r][c] = unassignedNames[ni++];
        }
      }
    }
  }

  // Replace everything under the CHANGELOG header with the log itself
  if (changelogStartIndex >= 0) {
    rows.splice(changelogStartIndex + 1);
    for (const entry of changelog) rows.push(['', ...entry]);
  }

  return rows;
}

// ---------- Google Sheets API (using googleapis) ----------

/**
 * Creates an authenticated OAuth2 client from a user's access token.
 * Used for all per-request Google API calls (Sheets, Drive, Gmail).
 */
function getGoogleAuth(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

// ---------- Service-account auth (admin sheet edits) ----------

/**
 * Parses GOOGLE_SERVICE_ACCOUNT_KEY — the full service-account JSON key,
 * stored either verbatim or base64-encoded (base64 avoids the quoting
 * hazards of multi-line JSON inside a .env file).
 *
 * Returns null when the variable is unset or unusable. Callers decide how
 * loud to be about that: the writer grant in createAgendaSheet() degrades
 * silently (the Toastmaster flow must never break over an optional admin
 * feature), while getServiceAccountAuth() throws, because an admin is
 * actively asking for a capability that isn't configured.
 */
function parseServiceAccountKey(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const key = JSON.parse(json);
    if (!key.client_email || !key.private_key) return null;
    return {
      client_email: key.client_email,
      // .env round-trips can leave the key's newlines as literal "\n" pairs;
      // a correctly parsed key contains none, so the replace is a no-op there.
      private_key: key.private_key.replace(/\\n/g, '\n'),
    };
  } catch (err) {
    console.error('[GoogleAPI] GOOGLE_SERVICE_ACCOUNT_KEY is set but could not be parsed:', err);
    return null;
  }
}

/** The service account's email, for per-sheet writer grants. Null if unconfigured. */
export function getServiceAccountEmail(): string | null {
  return parseServiceAccountKey()?.client_email ?? null;
}

/**
 * App-level Google credential for admin sheet edits.
 *
 * Admins sign in with credentials, never Google OAuth, so they have no
 * per-user access token — this JWT client authenticates as the club's
 * service account instead. Scoped to Sheets + Drive only (no Gmail: this
 * path only ever updates existing sheets, it never sends the agenda email).
 * The service account can only touch sheets it was explicitly granted
 * writer access on — see the per-sheet grant in createAgendaSheet().
 */
export function getServiceAccountAuth() {
  const key = parseServiceAccountKey();
  if (!key) {
    throw new Error(
      'Admin sheet editing is not configured: the GOOGLE_SERVICE_ACCOUNT_KEY environment variable is missing or invalid. See docs/GOOGLE_CLOUD_SETUP.md.'
    );
  }
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
}

/**
 * Creates a Google Sheet, writes data, and makes it shareable.
 */
export async function createAgendaSheet(
  accessToken: string,
  meetingDate: Date,
  theme: string,
  qotd: string,
  roleMap: Record<string, string>,
  csvTemplate: string,
  unassignedNames: string[],
  guestEducationActive: boolean = false
): Promise<{ sheetUrl: string; sheetId: string; shareWarning?: string }> {
  const title = `Gavel Club ${formatMeetingMonthDay(meetingDate)} - ${theme}`;

  const populatedRows = populateTemplate(csvTemplate, theme, qotd, roleMap, unassignedNames, [], guestEducationActive);
  const auth = getGoogleAuth(accessToken);
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  console.log('[GoogleAPI] Creating spreadsheet:', title);
  
  // Step 1: Create an empty spreadsheet
  const createRes = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: 'Sheet1' } }]
    }
  });

  const sheetId = createRes.data.spreadsheetId;
  const sheetUrl = createRes.data.spreadsheetUrl;
  
  if (!sheetId || !sheetUrl) {
    throw new Error('Failed to create spreadsheet: ID or URL is missing.');
  }
  
  console.log('[GoogleAPI] Created sheet:', sheetId);

  // Step 2: Write the populated data
  await writeSheetData(sheets, sheetId, populatedRows);

  // Step 3: Make shareable (anyone with link can view)
  // Not fatal — the sheet exists and is saved — but members can't open the
  // emailed link until it is shared, so the caller must be told.
  console.log('[GoogleAPI] Setting share permissions');
  let shareWarning: string | undefined;
  try {
    await drive.permissions.create({
      fileId: sheetId,
      requestBody: {
        type: 'anyone',
        role: 'reader'
      }
    });
  } catch (err) {
    console.error('[GoogleAPI] Permission error (non-fatal):', err);
    shareWarning = 'The agenda sheet could not be made viewable by link, so members may not be able to open it. Open the sheet, click Share, and set General access to "Anyone with the link".';
  }

  // Step 4: Grant the app's service account writer access, so an ADMIN (who
  // has no Google identity of their own) can later update this sheet through
  // getServiceAccountAuth(). Runs automatically on every creation; sheets
  // created before this shipped never got the grant and must be shared with
  // the service-account email by hand before admin edits work on them.
  const serviceAccountEmail = getServiceAccountEmail();
  if (serviceAccountEmail) {
    console.log('[GoogleAPI] Granting service account writer access');
    try {
      await drive.permissions.create({
        fileId: sheetId,
        sendNotificationEmail: false,
        requestBody: {
          type: 'user',
          role: 'writer',
          emailAddress: serviceAccountEmail
        }
      });
    } catch (err) {
      console.error('[GoogleAPI] Service-account grant error (non-fatal):', err);
    }
  }

  return { sheetUrl, sheetId, shareWarning };
}

// ---------- Changelog ----------

/** A name cell that holds nobody: the template placeholder, TBD, or an unstaffed '-'. */
function isNobody(name: string): boolean {
  return !name || name === 'NAME' || name === 'TBD' || name === NO_PERSON;
}

/**
 * Normalizes a role label so the same row matches across writes: "Speaker #1"
 * and "Speaker 1" are one role, and a Guest Education Session's relabeled
 * "Guest Speaker" row is still the Speaker 3 slot.
 */
function roleKey(label: string): string {
  const key = label.toLowerCase().replace(/#/g, '').replace(/:$/, '').replace(/\s+/g, ' ').trim();
  return key === 'guest speaker' ? 'speaker 3' : key;
}

/**
 * Rows that never produce a changelog line: General Feedback and Break Time are
 * unstaffed by design, and Comments and Closing Remarks always mirrors the
 * Toastmaster, whose own row already reports the change.
 */
function isExemptRole(key: string): boolean {
  return key.startsWith('general fe') || key === 'break time' || key === 'comments and closing remarks';
}

/**
 * Role → name for the agenda's role rows: everything above the BACKUP SPEAKER
 * line. The "No Roles" attendance grid and the changelog below it are not
 * roles, so reading them as such would report names as role changes. Roles
 * printed twice (Timer, Toastmaster…) are read once, from their first row.
 */
function agendaRoles(rows: string[][]): Map<string, { label: string; name: string }> {
  const roles = new Map<string, { label: string; name: string }>();
  for (const row of rows.slice(2)) {
    const label = (row[1] || '').trim();
    if (/^(backup speaker|no roles|changelog)/i.test(label)) break;
    if (!label) continue;
    const key = roleKey(label);
    if (isExemptRole(key) || roles.has(key)) continue;
    roles.set(key, { label, name: (row[3] || '').trim() });
  }
  return roles;
}

/**
 * The entries already under the sheet's CHANGELOG header, each from column B
 * on. The template's example line and numbered blanks are not entries. Lines
 * someone typed in by hand are kept like any other.
 */
function existingChangelog(rows: string[][]): string[][] {
  const header = rows.findIndex((r) => (r[1] || '').trim().startsWith('CHANGELOG'));
  if (header < 0) return [];
  return rows.slice(header + 1)
    .map((r) => r.slice(1).map((c) => (c ?? '').trim()))
    .filter((cells) => {
      const filled = cells.filter(Boolean);
      if (filled.length === 0) return false;
      return !(filled.length === 1 && (/^example:/i.test(filled[0]) || /^\d+$/.test(filled[0])));
    });
}

/**
 * The CHANGELOG section for an update: every entry already on the sheet, then
 * one line per role whose holder this write changes, e.g.
 * "[Oct 9, 6:44 PM] Grammarian: Franklin ---> Evangeline". An empty slot reads
 * "TBD", as it does on the agenda itself.
 *
 * The log only ever grows. A write that changes nobody (the pre-meeting
 * refresh, a re-save) adds nothing and keeps what is there.
 *
 * @param existingRows - The sheet as it is now (fetched via the Values API).
 * @param newRows      - The agenda about to be written (populateTemplate output).
 * @param now          - When the change is made, for the entry's timestamp.
 */
export function buildChangelog(existingRows: string[][], newRows: string[][], now: Date): string[][] {
  const before = agendaRoles(existingRows);
  const stamp = formatClubDateTime(now);
  const entries: string[][] = [];

  for (const [key, after] of agendaRoles(newRows)) {
    const prior = before.get(key);
    if (!prior) continue; // a row the old sheet did not have: nothing to compare
    const from = isNobody(prior.name) ? 'TBD' : prior.name;
    const to = isNobody(after.name) ? 'TBD' : after.name;
    if (from !== to) entries.push([`[${stamp}] ${after.label}: ${from} ---> ${to}`]);
  }

  return [...existingChangelog(existingRows), ...entries];
}

/**
 * Updates an existing Google Sheet with new role data.
 *
 * `accessToken` may be null: that is the ADMIN path, which authenticates as
 * the app's service account instead of a signed-in Google user. It only works
 * on sheets the service account was granted writer access to (automatic for
 * sheets created after the grant in createAgendaSheet() shipped).
 */
export async function updateAgendaSheet(
  accessToken: string | null,
  existingSheetId: string,
  theme: string,
  qotd: string,
  roleMap: Record<string, string>,
  csvTemplate: string,
  unassignedNames: string[],
  guestEducationActive: boolean = false
): Promise<void> {
  const auth = accessToken ? getGoogleAuth(accessToken) : getServiceAccountAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  
  // The sheet as it is now: the changelog is diffed against it and carried
  // over from it. Not optional — writing without it would wipe the log.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: existingSheetId,
    range: 'Sheet1'
  });
  const existingRows = (res.data.values || []) as string[][];

  const agendaRows = populateTemplate(csvTemplate, theme, qotd, roleMap, unassignedNames, [], guestEducationActive);
  const changelog = buildChangelog(existingRows, agendaRows, new Date());
  const populatedRows = populateTemplate(csvTemplate, theme, qotd, roleMap, unassignedNames, changelog, guestEducationActive);

  // Pad to the sheet's previous height: a shorter write would leave the old
  // tail (e.g. extra changelog lines from an earlier update) in place.
  await writeSheetData(sheets, existingSheetId, populatedRows, existingRows.length);
}

/**
 * Writes a 2D array to Sheet1 of a spreadsheet via the Values API.
 */
async function writeSheetData(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  rows: string[][],
  minRows: number = 0
) {
  // Normalize row widths, and blank out any rows below the new data
  const maxCols = Math.max(...rows.map(r => r.length));
  const normalized = rows.map(row => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });
  while (normalized.length < minRows) normalized.push(new Array(maxCols).fill(''));

  const endCol = String.fromCharCode(64 + Math.min(maxCols, 26));
  const range = `Sheet1!A1:${endCol}${normalized.length}`;

  console.log(`[GoogleAPI] Writing ${normalized.length} rows × ${maxCols} cols to ${spreadsheetId}`);

  // CRITICAL FIX: Use requestBody, NOT resource, to prevent {} in cell A1.
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: {
      values: normalized
    }
  });

  console.log(`[GoogleAPI] Write result: ${res.data.updatedCells} cells updated`);
}

/** Header values must never carry a line break — that would inject extra headers. */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export type GmailAttachment = { filename: string; content: Buffer; contentType?: string };

export type GmailMessageOptions = {
  /** Set when the club account sends on a member's behalf, so replies reach them instead of the club inbox. */
  replyTo?: string;
  /** Full From header, e.g. `"Club Name" <club@gmail.com>`. Omitted, Gmail uses the account's own. */
  from?: string;
  /** false puts the recipients in To instead of Bcc: only for an email to one person. */
  bcc?: boolean;
  /**
   * The visible To of a Bcc email: the sender's own address, so no member's
   * address shows and the sender keeps a copy. Required unless `bcc` is false.
   */
  visibleTo?: string;
  attachments?: GmailAttachment[];
};

/** Base64 in 76-character lines, as MIME requires. */
function base64Lines(data: Buffer | string): string {
  return (Buffer.from(data).toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');
}

/** An attachment's declared type, if it looks like one; anything else goes out as plain bytes. */
function safeContentType(type: string | undefined): string {
  return type && /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : 'application/octet-stream';
}

/**
 * Content-Disposition for a file. A printable-ASCII name is quoted as-is; any
 * other name uses the RFC 2231 encoded form, which Gmail and Outlook both read.
 */
function attachmentDisposition(filename: string): string {
  const name = sanitizeHeaderValue(filename).replace(/["\\]/g, '');
  if (/^[\x20-\x7e]*$/.test(name)) return `attachment; filename="${name}"`;
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename*=UTF-8''${encoded}`;
}

/**
 * Builds the RFC 2822 message the Gmail API expects. Every recipient goes in
 * Bcc to protect member email privacy; the visible To is the sender's own
 * address (`visibleTo`), so no member's address shows.
 *
 * NOT the empty "undisclosed-recipients:;" group: valid RFC 5322, but the
 * first agenda email sent with it (Oct 2026) failed with an "invalid header"
 * error, where every earlier one, with a real address in To, had gone out.
 *
 * Every part is base64, so a long single-line HTML body never breaks the
 * 998-character line limit, and the multipart boundary (which uses characters
 * outside the base64 alphabet) can never occur inside a part.
 */
export function buildRawGmailMessage(
  recipients: string[],
  subject: string,
  htmlBody: string,
  options?: GmailMessageOptions
): string {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const list = sanitizeHeaderValue(recipients.join(', '));
  const visibleTo = sanitizeHeaderValue(options?.visibleTo ?? '');
  if (options?.bcc !== false && !visibleTo) {
    throw new Error('A Bcc email needs a visible To address (visibleTo).');
  }
  const headers = [
    `MIME-Version: 1.0`,
    ...(options?.from ? [`From: ${sanitizeHeaderValue(options.from)}`] : []),
    ...(options?.bcc === false ? [`To: ${list}`] : [`To: ${visibleTo}`, `Bcc: ${list}`]),
    `Subject: ${utf8Subject}`,
  ];
  if (options?.replyTo) {
    headers.push(`Reply-To: ${sanitizeHeaderValue(options.replyTo)}`);
  }

  const htmlPart = [
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    '',
    base64Lines(htmlBody),
  ].join('\r\n');

  const attachments = options?.attachments ?? [];
  if (attachments.length === 0) {
    return [...headers, htmlPart].join('\r\n');
  }

  const boundary = `=_AgendaMaster_${randomUUID()}`;
  const parts = [
    htmlPart,
    ...attachments.map((a) => [
      `Content-Type: ${safeContentType(a.contentType)}`,
      `Content-Disposition: ${attachmentDisposition(a.filename)}`,
      `Content-Transfer-Encoding: base64`,
      '',
      base64Lines(a.content),
    ].join('\r\n')),
  ];
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    ...parts.map((part) => `--${boundary}\r\n${part}`),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/**
 * Sends an email via the Gmail API from the authenticated user's account —
 * the Toastmaster's own, or the club's (broadcasts, account emails, and
 * agendas for members without Google).
 *
 * A message without attachments goes as the JSON `raw` field, the path every
 * agenda email has used since launch. One with attachments goes to the upload
 * endpoint as message/rfc822, which accepts up to 35 MB; `raw` has a much
 * smaller request limit, too small for broadcast attachments.
 *
 * @returns The sent message's Gmail ID.
 */
export async function sendGmailAsUser(
  accessToken: string,
  recipients: string[],
  subject: string,
  htmlBody: string,
  options?: GmailMessageOptions
): Promise<string | null | undefined> {
  console.log(`[GoogleAPI] Sending Gmail to ${recipients.length} recipients...`);

  const message = buildRawGmailMessage(recipients, subject, htmlBody, options);

  const auth = getGoogleAuth(accessToken);
  const gmail = google.gmail({ version: 'v1', auth });

  const res = options?.attachments?.length
    ? await gmail.users.messages.send({
        userId: 'me',
        media: { mimeType: 'message/rfc822', body: message },
      })
    : await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: Buffer.from(message).toString('base64url') },
      });

  console.log(`✓ Gmail dispatched successfully (ID: ${res.data.id})`);
  return res.data.id;
}

