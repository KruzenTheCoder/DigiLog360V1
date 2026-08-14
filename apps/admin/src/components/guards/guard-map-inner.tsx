'use client';

// Browser-only inner component for the live guard map.
// Loaded via `next/dynamic({ ssr: false })` by guard-map.tsx — this file is
// NEVER imported on the server. Static imports here are safe.

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';

// Leaflet's default marker icons reference relative paths that break when
// bundled. Re-point them at unpkg so they always resolve.
import 'leaflet/dist/leaflet.css';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface Position {
  guard_id: string; guard_name: string | null;
  site_id: string | null; latitude: number; longitude: number;
  accuracy_m: number | null; recorded_at: string; on_patrol: boolean;
}

export default function GuardMapInner({ initial }: { initial: Position[] }) {
  const [items, setItems] = useState<Position[]>(initial);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel('guards-live')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'guard_positions' },
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any)
            .from('guard_positions_latest').select('*');
          setItems((data ?? []) as Position[]);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Default centre: Johannesburg (close to most demo sites).
  const centre: [number, number] = items.length > 0
    ? [items[0].latitude, items[0].longitude]
    : [-26.1, 28.05];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
      <Card className="overflow-hidden p-0" style={{ height: 520 }}>
        <MapContainer
          center={centre}
          zoom={items.length > 0 ? 14 : 11}
          scrollWheelZoom
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {items.map((p) => (
            <Marker key={p.guard_id} position={[p.latitude, p.longitude]}>
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <strong>{p.guard_name ?? p.guard_id.slice(0, 8)}</strong>
                  <br />
                  <small>{formatDateTime(p.recorded_at)}</small>
                  {p.accuracy_m && <div><small>±{Math.round(p.accuracy_m)} m</small></div>}
                </div>
              </Popup>
              {p.accuracy_m && p.accuracy_m > 0 && (
                <Circle
                  center={[p.latitude, p.longitude]}
                  radius={p.accuracy_m}
                  pathOptions={{ color: '#667eea', fillColor: '#667eea', fillOpacity: 0.15 }}
                />
              )}
            </Marker>
          ))}
        </MapContainer>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          On the map ({items.length})
        </p>
        <div className="space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-[hsl(var(--muted))]">
              No live positions. Guards report while on an active patrol.
            </p>
          )}
          {items.map((p) => (
            <div key={p.guard_id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <div>
                <p className="font-medium">{p.guard_name ?? '—'}</p>
                <p className="text-[11px] text-[hsl(var(--muted))]">
                  {formatDateTime(p.recorded_at)}
                </p>
              </div>
              {p.on_patrol
                ? <Badge color="#14b8a6">Patrol</Badge>
                : <Badge color="#64748b">Idle</Badge>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
