'use client';

// Thin shell that defers the entire Leaflet world to a client-only chunk.
// Importing react-leaflet/leaflet on the server crashes because they touch
// `window` at module load; routing through next/dynamic({ ssr: false })
// keeps them out of the server bundle entirely.

import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/card';

export type { Position } from './guard-map-inner';

const Inner = dynamic(() => import('./guard-map-inner'), {
  ssr: false,
  loading: () => (
    <Card className="flex items-center justify-center p-10 text-sm text-[hsl(var(--muted))]" style={{ height: 520 }}>
      Loading map…
    </Card>
  ),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function GuardMap(props: { initial: any[] }) {
  return <Inner initial={props.initial} />;
}
