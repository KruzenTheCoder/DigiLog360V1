/**
 * Ambient background for the landing page's sections.
 *
 * A faint survey grid with two brand-tinted washes drifting slowly across it,
 * so the large calm areas between cards have some life without competing with
 * the copy. Pure CSS — no client JS, nothing to hydrate.
 *
 * The washes animate transform and opacity only, which the compositor handles
 * without laying out or painting again, and both stop under
 * `prefers-reduced-motion` while the gradients themselves remain.
 *
 * Render it as the first child of a `relative isolate overflow-hidden`
 * section, with the section's own content in a sibling that establishes a
 * stacking context (`relative`) so it paints on top.
 *
 * `scheme` matters because the dark sections are hardcoded slate rather than
 * themed — their grid has to be drawn in white, not in `--border`.
 */
export function Ambient({
  tone = 'brand',
  scheme = 'light',
}: {
  tone?: 'brand' | 'violet' | 'sky' | 'emerald' | 'red' | 'amber';
  scheme?: 'light' | 'dark';
}) {
  const dark = scheme === 'dark';

  const WASH = {
    brand: ['rgba(102,126,234,0.20)', 'rgba(118,75,162,0.16)'],
    violet: ['rgba(139,92,246,0.18)', 'rgba(102,126,234,0.16)'],
    sky: ['rgba(14,165,233,0.16)', 'rgba(102,126,234,0.18)'],
    emerald: ['rgba(16,185,129,0.15)', 'rgba(14,165,233,0.15)'],
    red: ['rgba(220,38,38,0.16)', 'rgba(118,75,162,0.14)'],
    amber: ['rgba(245,158,11,0.14)', 'rgba(220,38,38,0.12)'],
  }[tone];

  // Dark grounds swallow a tinted line, so the grid is drawn in white there
  // and kept fainter — it should read as texture, never as a table.
  const gridLine = dark ? 'rgba(255,255,255,0.055)' : 'hsl(var(--border))';

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Survey grid, faded out towards the edges so it never meets a border */}
      <div
        className={dark ? 'absolute inset-0' : 'absolute inset-0 opacity-[0.5] dark:opacity-[0.35]'}
        style={{
          backgroundImage: `linear-gradient(to right, ${gridLine} 1px, transparent 1px), linear-gradient(to bottom, ${gridLine} 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(90% 70% at 50% 40%, #000 25%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(90% 70% at 50% 40%, #000 25%, transparent 78%)',
        }}
      />

      <div
        className="animate-drift-a absolute -left-[12%] -top-[30%] h-[38rem] w-[38rem] rounded-full motion-reduce:animate-none"
        style={{ background: `radial-gradient(circle, ${WASH[0]} 0%, transparent 68%)` }}
      />
      <div
        className="animate-drift-b absolute -bottom-[35%] -right-[10%] h-[42rem] w-[42rem] rounded-full motion-reduce:animate-none"
        style={{ background: `radial-gradient(circle, ${WASH[1]} 0%, transparent 68%)` }}
      />
    </div>
  );
}
