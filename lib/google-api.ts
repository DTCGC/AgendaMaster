/**
 * Google API integration using raw fetch() calls.
 * We bypass the `googleapis` Node.js client to avoid serialization issues
 * that were causing empty `{}` to appear in cell A1.
 */

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

/**
 * Populates the CSV template with role assignments.
 * Exported for testability.
 */
export function populateTemplate(
  csvTemplate: string,
  theme: string,
  qotd: string,
  roleMap: Record<string, string>,
  unassignedNames: string[]
): string[][] {
  const rows = csvTemplate.split('\n')
    .map(line => line.replace(/\r$/, ''))
    .filter(line => line.length > 0)
    .map(line => parseCSVRow(line));

  // Row 0: inject theme/qotd
  if (rows[0]?.[1]) {
    rows[0][1] = rows[0][1].replace('[QUESTION HERE]', qotd || theme);
  }

  let inNoRolesSection = false;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const roleLabel = (row[1] || '').trim();

    if (roleLabel.startsWith('No Roles')) { inNoRolesSection = true; continue; }
    if (roleLabel.startsWith('CHANGELOG')) break;

    if (inNoRolesSection) {
      for (let c = 1; c <= 4 && c < row.length; c++) {
        if ((row[c] || '').trim() === 'NAME') row[c] = '';
      }
      continue;
    }

    // Replace NAME placeholder in col 3 with the person assigned to the role in col 1
    if (row.length > 3 && (row[3] || '').trim() === 'NAME') {
      const person = roleMap[roleLabel];
      row[3] = person !== undefined ? person : 'TBD';
    }

    if (roleLabel === 'BACKUP SPEAKER:' && row.length > 3 && (row[3] || '').trim() === 'NAME') {
      row[3] = 'TBD';
    }
  }

  // Inject unassigned names
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

  return rows;
}

// ---------- Google Sheets API (raw fetch) ----------

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files';

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

  // Step 1: Create an empty spreadsheet
  console.log('[GoogleAPI] Creating spreadsheet:', title);
  const createRes = await fetch(SHEETS_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: 'Sheet1' } }]
    })
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create spreadsheet: ${createRes.status} ${err}`);
  }

  const createData = await createRes.json();
  const sheetId = createData.spreadsheetId;
  const sheetUrl = createData.spreadsheetUrl;
  console.log('[GoogleAPI] Created sheet:', sheetId);

  // Step 2: Write the populated data
  await writeSheetData(accessToken, sheetId, populatedRows);

  // Step 3: Make shareable (anyone with link can view)
  console.log('[GoogleAPI] Setting share permissions');
  const permRes = await fetch(`${DRIVE_BASE}/${sheetId}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'anyone', role: 'reader' })
  });

  if (!permRes.ok) {
    const err = await permRes.text();
    console.error('[GoogleAPI] Permission error (non-fatal):', err);
  }

  return { sheetUrl, sheetId };
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
  const populatedRows = populateTemplate(csvTemplate, theme, qotd, roleMap, unassignedNames);
  await writeSheetData(accessToken, existingSheetId, populatedRows);
}

/**
 * Writes a 2D array to Sheet1 of a spreadsheet via the Values API.
 */
async function writeSheetData(
  accessToken: string,
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
  const range = encodeURIComponent(`Sheet1!A1:${endCol}${normalized.length}`);
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${range}?valueInputOption=RAW`;

  console.log(`[GoogleAPI] Writing ${normalized.length} rows × ${maxCols} cols to ${spreadsheetId}`);
  console.log(`[GoogleAPI] Sample row 2:`, JSON.stringify(normalized[2]));
  console.log(`[GoogleAPI] Sample row 3:`, JSON.stringify(normalized[3]));

  const body = JSON.stringify({ values: normalized });

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to write sheet data: ${res.status} ${err}`);
  }

  const result = await res.json();
  console.log(`[GoogleAPI] Write result: ${result.updatedCells} cells updated`);
}

