// Tiny CSV exporter — handles quoting + line endings + UTF-8 BOM for Excel.
// Each row is an object; columns is the ordered list of [key, header] tuples.

type Cell = string | number | boolean | null | undefined;

function escapeCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; header: string; format?: (v: unknown, row: T) => Cell }[],
): string {
  const headerRow = columns.map((c) => escapeCell(c.header)).join(',');
  const bodyRows = rows.map((row) =>
    columns
      .map((c) => {
        const raw = row[c.key];
        const value = c.format ? c.format(raw, row) : (raw as Cell);
        return escapeCell(value);
      })
      .join(','),
  );
  return '﻿' + [headerRow, ...bodyRows].join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
