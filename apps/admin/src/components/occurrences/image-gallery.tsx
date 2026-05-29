'use client';

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Dialog } from '@/components/ui/dialog';
import { STORAGE_BUCKET, type OccurrenceImage } from '@digilog/shared';
import { formatDateTime } from '@/lib/utils';

export function ImageGallery({ images }: { images: OccurrenceImage[] }) {
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    if (images.length === 0) return;
    const supabase = createClient();
    supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrls(images.map((i) => i.storage_path), 3600)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<number, string> = {};
        data.forEach((d, idx) => { if (d.signedUrl) map[images[idx].id] = d.signedUrl; });
        setUrls(map);
      });
  }, [images]);

  if (images.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted))]">
        <ImageOff className="h-4 w-4" /> No photos attached.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {images.map((img) => (
          <button
            key={img.id}
            onClick={() => urls[img.id] && setZoom(urls[img.id])}
            className="group relative aspect-square overflow-hidden rounded-lg border bg-slate-100 dark:bg-slate-800"
          >
            {urls[img.id] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[img.id]} alt={img.caption ?? 'Evidence'}
                className="h-full w-full object-cover transition group-hover:scale-105" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-[hsl(var(--muted))]">Loading…</div>
            )}
            <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
              {formatDateTime(img.captured_at)}
            </span>
          </button>
        ))}
      </div>

      <Dialog open={!!zoom} onClose={() => setZoom(null)} className="max-w-3xl">
        {zoom && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={zoom} alt="Evidence" className="max-h-[80vh] w-full rounded-lg object-contain" />
        )}
      </Dialog>
    </>
  );
}
