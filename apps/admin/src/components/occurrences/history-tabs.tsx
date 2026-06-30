'use client';

// Tabbed History view — shows EITHER the closed occurrences OR the completed
// patrols, not both stacked. Each panel keeps its own filters/table/pagination.

import { useState } from 'react';
import { Archive, Footprints } from 'lucide-react';
import { HistoryOccurrences, type HistoryRow } from './history-occurrences';
import { CompletedPatrols } from './completed-patrols';
import type { PatrolDetailed } from '@digilog/shared';

type Tab = 'occurrences' | 'patrols';

export function HistoryTabs({ occ, pat }: { occ: HistoryRow[]; pat: PatrolDetailed[] }) {
  const [tab, setTab] = useState<Tab>('occurrences');

  return (
    <>
      <div className="mb-5 inline-flex rounded-xl border bg-[hsl(var(--surface))] p-1 shadow-sm">
        <TabBtn
          active={tab === 'occurrences'}
          onClick={() => setTab('occurrences')}
          icon={<Archive className="h-4 w-4" />}
          label="Closed Occurrences"
          count={occ.length}
        />
        <TabBtn
          active={tab === 'patrols'}
          onClick={() => setTab('patrols')}
          icon={<Footprints className="h-4 w-4" />}
          label="Completed Patrols"
          count={pat.length}
        />
      </div>

      {tab === 'occurrences'
        ? <HistoryOccurrences rows={occ} />
        : <CompletedPatrols patrols={pat} />}
    </>
  );
}

function TabBtn({
  active, onClick, icon, label, count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-brand text-white shadow-sm'
          : 'text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'
      }`}
    >
      {icon}
      {label}
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
        active ? 'bg-white/25 text-white' : 'bg-slate-100 text-[hsl(var(--muted))] dark:bg-slate-800'
      }`}>
        {count.toLocaleString()}
      </span>
    </button>
  );
}
