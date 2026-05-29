'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PencilLine, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UpdateOccurrenceDialog } from './update-dialog';
import type { Profile, OccurrenceStatus } from '@digilog/shared';

export function OccurrenceActions({
  occurrence, profile, hasReport,
}: {
  occurrence: { id: number; ob_number: string | null; status: OccurrenceStatus };
  profile: Profile;
  hasReport: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setOpen(true)}><PencilLine className="h-4 w-4" /> Update</Button>
      <Link href={hasReport ? `/reports?ob=${occurrence.ob_number}` : `/reports/new?occurrence=${occurrence.id}`}>
        <Button variant="secondary"><FileText className="h-4 w-4" /> {hasReport ? 'View Report' : 'Create Report'}</Button>
      </Link>
      <UpdateOccurrenceDialog
        open={open} onClose={() => setOpen(false)}
        occurrence={occurrence} profile={profile}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
