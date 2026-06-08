'use client';

// Tiny OCR drop-zone. Drag an image (a photographed crime scene note, a
// printed report, etc.) onto it; we OCR client-side via tesseract.js and
// return the extracted text to the parent. No server roundtrip.
//
// Lazy-loads tesseract.js only when the user actually drops a file, so the
// bundle stays small for everyone who never uses OCR.
import { useState, type DragEvent } from 'react';
import { Loader2, Upload, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props { onText: (text: string) => void }

export function OcrDropzone({ onText }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function process(file: File) {
    setBusy(true); setError(null); setProgress(0);
    try {
      const { recognize } = await import('tesseract.js');
      const url = URL.createObjectURL(file);
      const result = await recognize(url, 'eng', {
        logger: (m) => { if (m.status === 'recognizing text') setProgress(Math.round((m.progress ?? 0) * 100)); },
      });
      URL.revokeObjectURL(url);
      onText(result.data.text.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OCR failed');
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) process(file);
  }

  return (
    <Card
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="flex flex-col items-center gap-2 border-2 border-dashed p-5 text-center"
    >
      {busy ? (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
          <p className="text-sm">Reading image… {progress}%</p>
        </>
      ) : (
        <>
          <FileText className="h-6 w-6 text-[hsl(var(--muted))]" />
          <p className="text-sm">Drop a photo of a written note or printed report here.</p>
          <p className="text-xs text-[hsl(var(--muted))]">
            We'll extract the text right in your browser — no upload.
          </p>
          <label className="cursor-pointer">
            <input
              type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) process(f); }}
            />
            <Button variant="secondary"><Upload className="h-4 w-4" /> Pick image</Button>
          </label>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Card>
  );
}
