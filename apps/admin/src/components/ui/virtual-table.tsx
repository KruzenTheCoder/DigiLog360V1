/**
 * Virtualized Table Component for handling large datasets efficiently.
 * Only renders visible rows + overscan for smooth scrolling.
 */

'use client';

import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface VirtualTableProps<T> {
  data: T[];
  columns: {
    key: keyof T | string;
    header: React.ReactNode;
    width?: number | string;
    align?: 'left' | 'center' | 'right';
    cell: (row: T, index: number) => React.ReactNode;
  }[];
  rowHeight?: number;
  headerHeight?: number;
  overscan?: number;
  className?: string;
  onRowClick?: (row: T, index: number) => void;
  emptyState?: React.ReactNode;
  isLoading?: boolean;
  loadingSkeleton?: React.ReactNode;
}

const DEFAULT_ROW_HEIGHT = 48;
const DEFAULT_HEADER_HEIGHT = 40;
const DEFAULT_OVERSCAN = 5;

export function VirtualTable<T>({
  data,
  columns,
  rowHeight = DEFAULT_ROW_HEIGHT,
  headerHeight = DEFAULT_HEADER_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  className,
  onRowClick,
  emptyState,
  isLoading,
  loadingSkeleton,
}: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endIdx = Math.min(
      data.length - 1,
      Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
    );
    return { startIdx, endIdx };
  }, [scrollTop, containerHeight, rowHeight, data.length, overscan]);

  const totalHeight = data.length * rowHeight;
  const offsetY = visibleRange.startIdx * rowHeight;

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Measure container height
  useEffect(() => {
    if (containerRef.current) {
      setContainerHeight(containerRef.current.clientHeight);

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerHeight(entry.contentRect.height);
        }
      });

      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // Visible rows
  const visibleRows = useMemo(() => {
    const rows: T[] = [];
    for (let i = visibleRange.startIdx; i <= visibleRange.endIdx; i++) {
      if (i >= 0 && i < data.length) {
        rows.push(data[i]);
      }
    }
    return rows.map((row, idx) => ({ row, index: visibleRange.startIdx + idx }));
  }, [data, visibleRange]);

  if (isLoading && loadingSkeleton) {
    return (
      <div className={cn('w-full', className)}>
        {loadingSkeleton}
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return (
      <div className={cn('w-full', className)}>
        {emptyState}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'w-full overflow-auto scrollbar-thin',
        className
      )}
      onScroll={handleScroll}
      style={{ height: '100%', maxHeight: '100%' }}
    >
      <div style={{ height: totalHeight + headerHeight, position: 'relative' }}>
        {/* Header */}
        <div
          className="sticky top-0 z-10 bg-[hsl(var(--surface))] border-b"
          style={{ height: headerHeight }}
        >
          <div className="flex items-center h-full">
            {columns.map((col, idx) => (
              <div
                key={String(col.key)}
                className={cn(
                  'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]',
                  col.align === 'center' && 'text-center',
                  col.align === 'right' && 'text-right'
                )}
                style={{ width: col.width, flex: col.width ? undefined : 1 }}
              >
                {col.header}
              </div>
            ))}
          </div>
        </div>

        {/* Virtualized Rows */}
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleRows.map(({ row, index }) => (
            <div
              key={index}
              className={cn(
                'flex items-center border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                onRowClick && 'cursor-pointer'
              )}
              style={{ height: rowHeight }}
              onClick={() => onRowClick?.(row, index)}
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((col, colIdx) => (
                <div
                  key={String(col.key)}
                  className={cn(
                    'px-3 py-2 text-sm',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right'
                  )}
                  style={{ width: col.width, flex: col.width ? undefined : 1 }}
                >
                  {col.cell(row, index)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Optimized Static Table (for smaller datasets)
// ============================================================================

interface StaticTableProps<T> {
  data: T[];
  columns: {
    key: keyof T | string;
    header: React.ReactNode;
    width?: number | string;
    align?: 'left' | 'center' | 'right';
    cell: (row: T, index: number) => React.ReactNode;
  }[];
  className?: string;
  onRowClick?: (row: T, index: number) => void;
  emptyState?: React.ReactNode;
  isLoading?: boolean;
  rowKey?: (row: T, index: number) => string;
}

export function StaticTable<T>({
  data,
  columns,
  className,
  onRowClick,
  emptyState,
  isLoading,
  rowKey,
}: StaticTableProps<T>) {
  if (isLoading) {
    return (
      <div className={cn('w-full rounded-lg border overflow-hidden', className)}>
        <div className="animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex border-b last:border-0">
              {columns.map((_, j) => (
                <div key={j} className="flex-1 p-4">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return (
      <div className={cn('w-full', className)}>
        {emptyState}
      </div>
    );
  }

  return (
    <div className={cn('w-full overflow-x-auto scrollbar-thin', className)}>
      <table className="w-full caption-bottom text-sm">
        <thead className="border-b bg-[hsl(var(--surface))]">
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={cn(
                  'px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]',
                  col.align === 'center' && 'text-center',
                  col.align === 'right' && 'text-right'
                )}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={rowKey ? rowKey(row, index) : index}
              className={cn(
                'border-b last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                onRowClick && 'cursor-pointer'
              )}
              onClick={() => onRowClick?.(row, index)}
            >
              {columns.map((col) => (
                <td
                  key={String(col.key)}
                  className={cn(
                    'px-3 py-3',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right'
                  )}
                >
                  {col.cell(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// VirtualTable is already exported above
