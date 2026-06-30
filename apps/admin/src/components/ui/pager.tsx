'use client';

// Reusable client-side pagination for tables that hold their full result set in
// memory and filter on the client. Keeps long lists fast to render (only the
// current page is in the DOM) and consistent across pages.
//
// Usage:
//   const pg = usePagedRows(filteredRows, 50);
//   {pg.pageRows.map(...)}
//   <Pager {...pg} />
//
// Reset to page 1 when filters change by calling pg.setPage(1) in a filter
// effect (the hook also clamps the page if the row count shrinks).

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500];

export interface Paged<T> {
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  total: number;
  totalPages: number;
  pageRows: T[];
  from: number; // 1-based index of first row on this page (0 when empty)
  to: number;   // 1-based index of last row on this page
}

export function usePagedRows<T>(rows: T[], initialSize = 50): Paged<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp the page when the row set or page size shrinks beneath it.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const start = (page - 1) * pageSize;
  const pageRows = useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize]);

  return {
    page, setPage, pageSize, setPageSize, total, totalPages, pageRows,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
  };
}

export function Pager<T>({
  page, setPage, pageSize, setPageSize, total, totalPages, from, to,
  className = '',
}: Paged<T> & { className?: string }) {
  if (total === 0) return null;
  return (
    <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <p className="text-xs text-[hsl(var(--muted))]">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <label className="text-xs text-[hsl(var(--muted))]">Per page</label>
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className="h-8 rounded-md border bg-[hsl(var(--surface))] px-2 text-xs outline-none focus:border-brand"
        >
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <span className="min-w-[5.5rem] text-center text-xs text-[hsl(var(--muted))]">
          Page {page.toLocaleString()} / {totalPages.toLocaleString()}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
