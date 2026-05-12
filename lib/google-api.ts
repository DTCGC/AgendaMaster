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
 */
import { google } from 'googleapis';

// ---------- Template Population (pure logic, no API calls) ----------

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
  changelog: string[] = []
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
        row[3] = '-';
      } else {
        const person = roleMap[roleLabel];
        row[3] = person !== undefined && person !== '' ? person : 'TBD';
      }
    }

    // BACKUP SPEAKER is always TBD (never auto-assigned)
    if (roleLabel === 'BACKUP SPEAKER:' && row.length > 3 && (row[3] || '').trim() === 'NAME') {
      row[3] = 'TBD';
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
  unassignedNames: string[]
): Promise<{ sheetUrl: string; sheetId: string }> {
  const month = String(meetingDate.getMonth() + 1).padStart(2, '0');
  const day = String(meetingDate.getDate()).padStart(2, '0');
  const title = `Gavel Club ${month}/${day} - ${theme}`;

  const populatedRows = populateTemplate(csvTemplate, theme, qotd, roleMap, unassignedNames);
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
  console.log('[GoogleAPI] Setting share permissions');
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
  }

  return { sheetUrl, sheetId };
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
  const oldRoleMap: Record<string, string> = {};
  
  for (const row of existingRows) {
    if (row.length > 3 && row[1]) {
      const roleLabel = row[1].trim();
      const person = row[3].trim();
      if (person && person !== 'NAME' && person !== 'TBD' && person !== '-') {
        oldRoleMap[roleLabel] = person;
      }
    }
  }

  const persons = new Set<string>();
  for (const p of Object.values(oldRoleMap)) persons.add(p);
  for (const p of Object.values(newRoleMap)) if (p && p !== 'TBD' && p !== '-') persons.add(p);

  const changelog: string[] = [];

  for (const p of persons) {
    const oldR = Object.keys(oldRoleMap).filter(r => oldRoleMap[r] === p && !r.toLowerCase().includes('general'));
    const newR = Object.keys(newRoleMap).filter(r => newRoleMap[r] === p && !r.toLowerCase().includes('general'));

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
 */
export async function updateAgendaSheet(
  accessToken: string,
  existingSheetId: string,
  theme: string,
  qotd: string,
  roleMap: Record<string, string>,
  csvTemplate: string,
  unassignedNames: string[]
): Promise<void> {
  const auth = getGoogleAuth(accessToken);
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
  const populatedRows = populateTemplate(csvTemplate, theme, qotd, roleMap, unassignedNames, changelog);
  
  await writeSheetData(sheets, existingSheetId, populatedRows);
}

/**
 * Writes a 2D array to Sheet1 of a spreadsheet via the Values API.
 */
async function writeSheetData(
  sheets: any,
  spreadsheetId: string,
  rows: string[][]
) {
  // Normalize row widths
  const maxCols = Math.max(...rows.map(r => r.length));
  const normalized = rows.map(row => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });

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

/**
 * Sends an email via the Gmail API from the authenticated user's account.
 */
export async function sendGmailAsUser(
  accessToken: string,
  recipients: string[],
  subject: string,
  htmlBody: string
) {
  console.log(`[GoogleAPI] Sending Gmail to ${recipients.length} recipients...`);

  // Gmail API requires RFC 2822 formatted messages, base64url-encoded.
  // We use BCC for multiple recipients to protect member email privacy.
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const message = [
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
    `To: ${recipients[0]}`, // Standard 'To' field
    `Bcc: ${recipients.join(', ')}`, // Send all others as BCC
    `Subject: ${utf8Subject}`,
    '',
    htmlBody
  ].join('\r\n');

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

