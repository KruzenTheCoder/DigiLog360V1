// Generic route skeleton — shown instantly while a server component streams.
// A layout-shaped skeleton reads as "content loading" and feels faster than a
// bare spinner (perceived performance), and works for every route as a
// fallback regardless of the specific page.
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* header banner */}
      <div className="mb-6 h-24 rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
      {/* KPI / stat strip */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-200/70 dark:bg-slate-800/60" />
        ))}
      </div>
      {/* content cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
        <div className="h-64 rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
      </div>
    </div>
  );
}
