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
 *                            (a Toastmaster, or the club account on a member's behalf)
 */
import { google, sheets_v4 } from 'googleapis';
import { formatMeetingMonthDay } from './meeting-time';

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
  changelog: string[] = [],
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

  // Append changelog entries (role swaps from previous version)
  if (changelogStartIndex >= 0 && changelog.length > 0) {
    let ci = 0;
    // Overwrite subsequent rows with changelog data
    for (let r = changelogStartIndex + 1; r < rows.length && ci < changelog.length; r++) {
        rows[r][1] = changelog[ci++];
    }
    // If changelog exceeds available empty rows, push new rows
    while (ci < changelog.length) {
      rows.push(['', changelog[ci++], '', '', '']);
    }
  } else if (changelogStartIndex >= 0) {
    // If no changelog, just clear the example line
    if (changelogStartIndex + 1 < rows.length) {
      rows[changelogStartIndex + 1][1] = '';
    }
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

/**
 * Computes a person-centric changelog by diffing existing sheet data against a new role map.
 * Produces entries like "[John: Timer ---> Grammarian]" for the CHANGELOG section.
 *
 * @param existingRows - 2D array of current sheet data (fetched via Values API).
 * @param newRoleMap   - The new role→person mapping being applied.
 * @returns Array of human-readable changelog strings.
 */
function computeChangelog(existingRows: string[][], newRoleMap: Record<string, string>): string[] {
  // Rows that must never produce a changelog line. General Feedback is unstaffed
  // by design; the Backup Speaker is a standby title that routinely changes
  // hands without anyone's actual duties changing, so diffing it is pure noise.
  const isExempt = (roleLabel: string) => {
    const l = roleLabel.toLowerCase().replace(/:$/, '').trim();
    return l.startsWith('general fe') || l === 'backup speaker';
  };

  const oldRoleMap: Record<string, string> = {};
  
  for (const row of existingRows) {
    if (row.length > 3 && row[1]) {
      const roleLabel = row[1].trim();
      const person = row[3].trim();
      if (person && person !== 'NAME' && person !== 'TBD' && person !== NO_PERSON) {
        oldRoleMap[roleLabel] = person;
      }
    }
  }

  const persons = new Set<string>();
  for (const p of Object.values(oldRoleMap)) persons.add(p);
  for (const p of Object.values(newRoleMap)) if (p && p !== 'TBD' && p !== NO_PERSON) persons.add(p);

  const changelog: string[] = [];

  for (const p of persons) {
    const oldR = Object.keys(oldRoleMap).filter(r => oldRoleMap[r] === p && !isExempt(r));
    const newR = Object.keys(newRoleMap).filter(r => newRoleMap[r] === p && !isExempt(r));

    const lost = oldR.filter(r => !newR.includes(r));
    const gained = newR.filter(r => !oldR.includes(r));

    const maxProps = Math.max(lost.length, gained.length);
    for (let i = 0; i < maxProps; i++) {
        if (i < lost.length && i < gained.length) {
            changelog.push(`[${p}: ${lost[i]} ---> ${gained[i]}]`);
        } else if (i < lost.length) {
            changelog.push(`[${p}: ${lost[i]} ---> TBD]`);
        }
    }
  }
  
  return changelog;
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
  
  // Fetch existing sheet data to compute the changelog
  let existingRows: string[][] = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: existingSheetId,
      range: 'Sheet1!A1:E80'
    });
    existingRows = res.data.values || [];
  } catch (err) {
    console.error('[GoogleAPI] Failed to fetch existing sheet for changelog:', err);
  }

  const changelog = computeChangelog(existingRows, roleMap);
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

/**
 * Builds the RFC 2822 message the Gmail API expects (before base64url encoding).
 * Every recipient goes in Bcc to protect member email privacy; the visible To
 * is the empty "undisclosed-recipients" group, so no member's address shows.
 */
export function buildRawGmailMessage(
  recipients: string[],
  subject: string,
  htmlBody: string,
  options?: { replyTo?: string }
): string {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const headers = [
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
    `To: undisclosed-recipients:;`,
    `Bcc: ${sanitizeHeaderValue(recipients.join(', '))}`,
    `Subject: ${utf8Subject}`,
  ];
  // Set when the club account sends on a member's behalf, so replies reach
  // the Toastmaster instead of the club inbox.
  if (options?.replyTo) {
    headers.push(`Reply-To: ${sanitizeHeaderValue(options.replyTo)}`);
  }
  return [...headers, '', htmlBody].join('\r\n');
}

/**
 * Sends an email via the Gmail API from the authenticated user's account —
 * the Toastmaster's own, or the club's on behalf of a member without Google.
 */
export async function sendGmailAsUser(
  accessToken: string,
  recipients: string[],
  subject: string,
  htmlBody: string,
  options?: { replyTo?: string }
) {
  console.log(`[GoogleAPI] Sending Gmail to ${recipients.length} recipients...`);

  // Gmail API requires RFC 2822 formatted messages, base64url-encoded.
  const message = buildRawGmailMessage(recipients, subject, htmlBody, options);

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const auth = getGoogleAuth(accessToken);
  const gmail = google.gmail({ version: 'v1', auth });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage }
  });

  console.log(`✓ Gmail dispatched successfully (ID: ${res.data.id})`);
}

