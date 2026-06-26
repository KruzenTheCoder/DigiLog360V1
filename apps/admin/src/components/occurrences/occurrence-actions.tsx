'use client';

import Link from 'next/link';
import { PencilLine, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OccurrenceStatus } from '@digilog/shared';

export function OccurrenceActions({
  occurrence, hasReport,
}: {
  occurrence: { id: number; ob_number: string | null; status: OccurrenceStatus };
  hasReport: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {/* These sit inside the coloured PageHeader, so the default brand-gradient
          / white-secondary variants disappear into the background. Use solid
          high-contrast styles instead: white primary + blue-gradient secondary. */}
      <Link href={`/reports/new?occurrence=${occurrence.id}`}>
        <Button className="border-0 bg-white text-brand shadow-sm hover:bg-white/90">
          <PencilLine className="h-4 w-4" /> Update
        </Button>
      </Link>
      <Link href={hasReport ? `/reports?ob=${occurrence.ob_number}` : `/reports/new?occurrence=${occurrence.id}`}>
        <Button className="border-0 bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm hover:opacity-90">
          <FileText className="h-4 w-4" /> {hasReport ? 'View Report' : 'Create Report'}
        </Button>
      </Link>
    </div>
  );
}
