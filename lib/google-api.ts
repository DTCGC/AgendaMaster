import { google } from 'googleapis';

/**
 * Builds an authenticated OAuth2 client from the user's access token.
 * This token comes from the NextAuth session (Google OAuth sign-in).
 */
function getAuthClient(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

/**
 * Creates a Google Sheet on the user's Drive, populated with agenda data.
 * 
 * @param accessToken - The signed-in member's Google OAuth access token
 * @param meetingDate - The meeting date (for the filename)
 * @param theme - Meeting theme (appended to filename)
 * @param roleAssignments - Map of roleName → display name
 * @param csvTemplate - Raw CSV string from MeetingTemplate.schemaStructure
 * @returns The shareable link to the created Google Sheet
 */
export async function createAgendaSheet(
  accessToken: string,
  meetingDate: Date,
  theme: string,
  roleAssignments: Record<string, string>,
  csvTemplate: string
): Promise<{ sheetUrl: string; sheetId: string }> {
  const auth = getAuthClient(accessToken);
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  // Format the filename: "Gavel Club MM_DD - [THEME] - Sheet1"
  const month = String(meetingDate.getMonth() + 1).padStart(2, '0');
  const day = String(meetingDate.getDate()).padStart(2, '0');
  const title = `Gavel Club ${month}_${day} - ${theme}`;

  // Parse the CSV template into a 2D array
  const rows = csvTemplate.split('\n')
    .map(line => line.replace(/\r$/, ''))
    .filter(line => line.trim() !== '')
    .map(line => parseCSVRow(line));

  // Replace NAME placeholders with actual role assignments
  const populatedRows = rows.map(row => {
    return row.map((cell, colIndex) => {
      // Column index 1 is typically the role name column
      if (cell === 'NAME' || cell.trim() === 'NAME') {
        // Find the matching role from the previous column's value
        const roleLabel = row[1]?.trim();
        if (roleLabel && roleAssignments[roleLabel]) {
          return roleAssignments[roleLabel];
        }
        // Also check column at index colIndex-1 for the role name
        const prevCell = colIndex > 0 ? row[colIndex - 1]?.trim() : '';
        if (prevCell && roleAssignments[prevCell]) {
          return roleAssignments[prevCell];
        }
      }
      return cell;
    });
  });

  // Also inject the theme into the header row
  populatedRows[0] = populatedRows[0]?.map(cell => {
    if (typeof cell === 'string' && cell.includes('[QUESTION HERE]')) {
      return cell.replace('[QUESTION HERE]', theme);
    }
    return cell;
  }) || populatedRows[0];

  // Create the spreadsheet
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{
        properties: { title: 'Sheet1' },
        data: [{
          startRow: 0,
          startColumn: 0,
          rowData: populatedRows.map(row => ({
            values: row.map(cell => ({
              userEnteredValue: { stringValue: String(cell) }
            }))
          }))
        }]
      }]
    }
  });

  const sheetId = spreadsheet.data.spreadsheetId!;
  const sheetUrl = spreadsheet.data.spreadsheetUrl!;

  // Make the sheet viewable by anyone with the link
  await drive.permissions.create({
    fileId: sheetId,
    requestBody: {
      type: 'anyone',
      role: 'reader',
    }
  });

  return { sheetUrl, sheetId };
}

/**
 * Sends an email via the Gmail API using the signed-in member's account.
 * This sends FROM the Toastmaster's own Gmail, not the admin SMTP bridge.
 * 
 * @param accessToken - The signed-in member's Google OAuth access token
 * @param recipients - Array of email addresses
 * @param subject - Email subject line
 * @param htmlBody - Full HTML email body
 */
export async function sendGmailAsUser(
  accessToken: string,
  recipients: string[],
  subject: string,
  htmlBody: string
): Promise<{ success: boolean; messageId?: string }> {
  const auth = getAuthClient(accessToken);
  const gmail = google.gmail({ version: 'v1', auth });

  // Build the RFC 2822 formatted email
  const toList = recipients.join(', ');
  const rawEmail = [
    `To: ${toList}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody
  ].join('\r\n');

  // Base64url encode the email
  const encodedMessage = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage
    }
  });

  return {
    success: true,
    messageId: response.data.id || undefined
  };
}

/**
 * Simple CSV row parser that handles quoted fields with commas.
 */
function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
