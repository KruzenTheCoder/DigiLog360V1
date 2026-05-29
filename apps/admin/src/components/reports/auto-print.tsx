'use client';
import { useEffect } from 'react';
import { Printer } from 'lucide-react';

export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <button
      onClick={() => window.print()}
      className="no-print fixed right-4 top-4 inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow"
    >
      <Printer className="h-4 w-4" /> Print / Save as PDF
    </button>
  );
}
