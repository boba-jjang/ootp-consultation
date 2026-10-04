/**
 * Parses CSV text into rows of fields (RFC 4180). A quoted field may hold commas, line
 * breaks and doubled quotes. A leading byte-order mark is ignored and blank lines are
 * skipped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.startsWith('\uFEFF') ? 1 : 0;

  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== '') {
      rows.push(row);
    }
    row = [];
    field = '';
  };

  for (; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      endRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    endRow();
  }
  return rows;
}
