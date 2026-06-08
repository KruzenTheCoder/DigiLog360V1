'use client';

/**
 * Lightweight signature pad — HTML canvas + pointer events. No third-party
 * dependency. Captures finger / mouse / stylus strokes and exports a PNG
 * data URL on demand. Used for manager bulk-acknowledgement sign-off.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  /** Height in px; width fills the parent. */
  height?: number;
  /** Stroke colour. Defaults to a near-black that prints well. */
  color?: string;
  /** Background colour painted under the strokes. Defaults to white so the
   *  exported PNG has the right look on paper. */
  background?: string;
}

export function SignaturePad({
  onChange, height = 160, color = '#0f172a', background = '#ffffff',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Resize the canvas backing store to match the displayed size + DPR. Run
  // on mount and on window resize so signatures stay crisp.
  const resizeAndClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
  }, [background, color]);

  useEffect(() => {
    resizeAndClear();
    setIsEmpty(true);
    onChange(null);
    window.addEventListener('resize', resizeAndClear);
    return () => window.removeEventListener('resize', resizeAndClear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeAndClear]);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pointerPos(e);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const cur = pointerPos(e);
    const last = lastRef.current ?? cur;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
    lastRef.current = cur;
    if (isEmpty) setIsEmpty(false);
  }
  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    // Emit the data URL only when a stroke actually finishes.
    const data = canvasRef.current?.toDataURL('image/png');
    onChange(data && !isEmpty ? data : null);
  }

  function clear() {
    resizeAndClear();
    setIsEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-white"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          style={{
            width: '100%', height: '100%',
            display: 'block', touchAction: 'none', cursor: 'crosshair',
          }}
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[hsl(var(--muted))]">
            Sign here
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-[hsl(var(--muted))]">
        <span>{isEmpty ? 'No signature yet' : 'Signature captured'}</span>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 text-[hsl(var(--foreground))] hover:text-brand"
        >
          <Eraser className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
    </div>
  );
}
