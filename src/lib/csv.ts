export interface CsvColumn {
  key: string;
  header: string;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serialises rows to RFC 4180 CSV (with a BOM so Excel reads UTF-8) and downloads it. */
export function downloadCsv(
  filename: string,
  columns: CsvColumn[],
  rows: Record<string, unknown>[]
): void {
  const lines = [
    columns.map((c) => escapeCell(c.header)).join(','),
    ...rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
