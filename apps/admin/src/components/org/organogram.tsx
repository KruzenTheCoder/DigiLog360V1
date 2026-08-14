'use client';

// The organogram as a canvas: drag people to arrange them, drag a connector
// from one card to another to set who reports to whom.
//
// Built with absolutely-positioned cards over an SVG layer rather than a
// diagram library — 60 cards and a few dozen lines is well within what plain
// pointer events handle, and it keeps the admin bundle where it is.
//
// Anyone without a saved position gets one computed from the reporting tree,
// so a chart nobody has arranged still opens tidy rather than as a pile in
// the corner.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Link2Off, Loader2, Maximize2, Minus, Plus, RotateCcw, Users2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

interface Person {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  reports_to: string | null;
}
interface Pos { x: number; y: number }

const ROLE_TONE: Record<string, string> = {
  super_user: '#7c3aed', admin: '#667eea', manager: '#0891b2',
  control_room: '#0ea5e9', supervisor: '#d97706', guard: '#64748b',
};
const ROLE_LABEL: Record<string, string> = {
  super_user: 'Super User', admin: 'Administrator', manager: 'Manager',
  control_room: 'Control Room', supervisor: 'Supervisor', guard: 'Officer',
};

const CARD_W = 190;
const CARD_H = 62;
const COL_GAP = 30;
const ROW_GAP = 110;

export function Organogram({
  people: initial, positions: savedPositions, canEdit,
}: {
  people: Person[];
  positions: Array<{ profile_id: string; x: number; y: number }>;
  canEdit: boolean;
}) {
  const [people, setPeople] = useState<Person[]>(initial);
  const [pos, setPos] = useState<Record<string, Pos>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  // What the pointer is currently doing. Kept in a ref as well as state so the
  // move handler doesn't re-subscribe on every pixel.
  const dragRef = useRef<
    | { kind: 'move'; id: string; dx: number; dy: number }
    | { kind: 'link'; from: string }
    | null
  >(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Pos | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Canvas zoom. Sixty cards across is far wider than any screen, so being
  // able to pull back and see the whole shape matters more than card detail.
  const [zoom, setZoom] = useState(1);

  // ── Initial layout ───────────────────────────────────────────────────────
  // Saved positions win; anyone without one is placed by walking the tree, so
  // depth becomes row and sibling order becomes column.
  const computeLayout = useCallback((rows: Person[]) => {
    const byId = new Map(rows.map((p) => [p.id, p]));
    const kids = new Map<string | null, Person[]>();
    for (const p of rows) {
      const parent = p.reports_to && byId.has(p.reports_to) ? p.reports_to : null;
      const list = kids.get(parent) ?? [];
      list.push(p);
      kids.set(parent, list);
    }
    for (const list of kids.values()) {
      list.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''));
    }
    const out: Record<string, Pos> = {};
    let cursor = 0;
    let deepest = 0;

    const place = (person: Person, depth: number) => {
      deepest = Math.max(deepest, depth);
      const children = kids.get(person.id) ?? [];
      if (children.length === 0) {
        out[person.id] = { x: cursor * (CARD_W + COL_GAP) + 40, y: depth * ROW_GAP + 40 };
        cursor += 1;
        return;
      }
      const before = cursor;
      children.forEach((c) => place(c, depth + 1));
      // Sit the parent over the middle of its children.
      const first = out[children[0].id].x;
      const last = out[children[children.length - 1].id].x;
      out[person.id] = { x: (first + last) / 2, y: depth * ROW_GAP + 40 };
      if (cursor === before) cursor += 1;
    };

    // The reporting structure is the point of this page, so it is laid out
    // FIRST and on its own. Previously every unconnected person was treated as
    // an equal root, which strung 46 lone cards across the top row and buried
    // the actual hierarchy among them.
    const roots = kids.get(null) ?? [];
    const descendants = (p: Person): number => {
      const cs = kids.get(p.id) ?? [];
      return cs.length + cs.reduce((n, c) => n + descendants(c), 0);
    };
    const trees = roots.filter((r) => (kids.get(r.id) ?? []).length > 0)
      // Biggest tree first — the main chain of command leads.
      .sort((a, b) => descendants(b) - descendants(a));
    const unattached = roots.filter((r) => (kids.get(r.id) ?? []).length === 0);

    trees.forEach((r) => {
      place(r, 0);
      cursor += 1; // a clear gap between separate trees
    });

    // Everyone with no reporting line sits in a compact block underneath,
    // clearly below the structure rather than pretending to be part of it.
    const bandY = (deepest + 1) * ROW_GAP + 90;
    const perRow = Math.max(4, Math.ceil(Math.sqrt(unattached.length * 1.8)));
    unattached.forEach((p, i) => {
      out[p.id] = {
        x: (i % perRow) * (CARD_W + COL_GAP) + 40,
        y: bandY + Math.floor(i / perRow) * (CARD_H + 26),
      };
    });

    return out;
  }, []);

  useEffect(() => {
    const saved: Record<string, Pos> = {};
    for (const p of savedPositions) saved[p.profile_id] = { x: Number(p.x), y: Number(p.y) };
    const computed = computeLayout(initial);
    const merged: Record<string, Pos> = {};
    for (const p of initial) merged[p.id] = saved[p.id] ?? computed[p.id] ?? { x: 40, y: 40 };
    setPos(merged);
  }, [initial, savedPositions, computeLayout]);

  // ── Persistence ──────────────────────────────────────────────────────────
  async function savePosition(id: string, p: Pos) {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const orgId = (initial as unknown as Array<{ org_id?: string }>)[0]?.org_id;
    await sb.from('org_chart_positions').upsert(
      { profile_id: id, x: Math.round(p.x), y: Math.round(p.y), ...(orgId ? { org_id: orgId } : {}), updated_at: new Date().toISOString() },
      { onConflict: 'profile_id' },
    );
  }

  async function setManager(childId: string, managerId: string | null) {
    const prev = people.find((p) => p.id === childId)?.reports_to ?? null;
    // Optimistic — the line should follow the pointer immediately.
    setPeople((ps) => ps.map((p) => (p.id === childId ? { ...p, reports_to: managerId } : p)));
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const { error } = await sb.from('profiles').update({ reports_to: managerId }).eq('id', childId);
    setSaving(false);
    if (error) {
      // The database refuses loops; put the line back and say why.
      setPeople((ps) => ps.map((p) => (p.id === childId ? { ...p, reports_to: prev } : p)));
      setMsg({ kind: 'error', text: error.message });
      return;
    }
    const name = (id: string | null) => people.find((p) => p.id === id)?.full_name ?? 'Unknown';
    setMsg({
      kind: 'ok',
      text: managerId
        ? `${name(childId)} now reports to ${name(managerId)}.`
        : `${name(childId)} no longer reports to anyone.`,
    });
  }

  // ── Pointer handling ─────────────────────────────────────────────────────
  // Canvas coordinates from a screen event. Dividing by the zoom keeps a
  // dragged card under the pointer instead of drifting away from it.
  const pointFromEvent = (e: PointerEvent | React.PointerEvent): Pos => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: (e.clientX - (rect?.left ?? 0) + (canvasRef.current?.scrollLeft ?? 0)) / zoom,
      y: (e.clientY - (rect?.top ?? 0) + (canvasRef.current?.scrollTop ?? 0)) / zoom,
    };
  };

  // Which card is under the pointer, by hit-testing the coordinates.
  //
  // Deliberately NOT pointerenter/pointerleave on the cards: those are skipped
  // when the pointer moves fast, and on touch devices they do not fire during
  // a drag at all — which would make connecting impossible on a tablet, the
  // very device a supervisor is most likely to use.
  const cardUnder = (e: PointerEvent): string | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return (el?.closest('[data-person-id]') as HTMLElement | null)?.dataset.personId ?? null;
  };

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const pt = pointFromEvent(e);
      if (d.kind === 'move') {
        setPos((p) => ({ ...p, [d.id]: { x: Math.max(0, pt.x - d.dx), y: Math.max(0, pt.y - d.dy) } }));
      } else {
        setGhost(pt);
        const over = cardUnder(e);
        setHoverId(over && over !== d.from ? over : null);
      }
    }
    function onUp(e: PointerEvent) {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      if (d.kind === 'move') {
        const p = pos[d.id];
        if (p) void savePosition(d.id, p);
      } else {
        // Resolve the drop target from where the pointer actually ended up,
        // so a fast or touch-driven drag lands the same as a slow mouse one.
        const target = cardUnder(e);
        if (target && target !== d.from) void setManager(d.from, target);
        setLinkFrom(null);
        setGhost(null);
      }
      setHoverId(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  });

  function startMove(e: React.PointerEvent, id: string) {
    if (!canEdit) return;
    e.preventDefault();
    const pt = pointFromEvent(e);
    const p = pos[id] ?? { x: 0, y: 0 };
    dragRef.current = { kind: 'move', id, dx: pt.x - p.x, dy: pt.y - p.y };
  }

  function startLink(e: React.PointerEvent, id: string) {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { kind: 'link', from: id };
    setLinkFrom(id);
    setGhost(pointFromEvent(e));
  }

  // Shrink until the whole chart fits the visible area. With sixty people the
  // arrangement is far wider than any screen, so "show me the shape" is the
  // most common thing to want.
  function fitToView() {
    const el = canvasRef.current;
    if (!el) return;
    const xs = Object.values(pos);
    if (xs.length === 0) return;
    const w = Math.max(...xs.map((p) => p.x)) + CARD_W + 40;
    const h = Math.max(...xs.map((p) => p.y)) + CARD_H + 40;
    const next = Math.min(1, el.clientWidth / w, el.clientHeight / h);
    setZoom(Math.max(0.2, +next.toFixed(2)));
    el.scrollTo({ left: 0, top: 0 });
  }

  async function autoArrange() {
    const computed = computeLayout(people);
    setPos(computed);
    setSaving(true);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const orgId = (initial as unknown as Array<{ org_id?: string }>)[0]?.org_id;
    await sb.from('org_chart_positions').upsert(
      people.map((p) => ({
        profile_id: p.id, x: Math.round(computed[p.id]?.x ?? 40), y: Math.round(computed[p.id]?.y ?? 40),
        ...(orgId ? { org_id: orgId } : {}), updated_at: new Date().toISOString(),
      })),
      { onConflict: 'profile_id' },
    );
    setSaving(false);
    setMsg({ kind: 'ok', text: 'Chart tidied up.' });
  }

  // Lines, drawn from the middle-bottom of the manager to the middle-top of
  // the report.
  const edges = useMemo(() => {
    const out: Array<{ id: string; d: string; childId: string; midX: number; midY: number }> = [];
    for (const p of people) {
      if (!p.reports_to) continue;
      const a = pos[p.reports_to];
      const b = pos[p.id];
      if (!a || !b) continue;
      const x1 = a.x + CARD_W / 2, y1 = a.y + CARD_H;
      const x2 = b.x + CARD_W / 2, y2 = b.y;
      const midY = (y1 + y2) / 2;
      out.push({
        id: `${p.reports_to}-${p.id}`,
        childId: p.id,
        d: `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`,
        midX: (x1 + x2) / 2,
        midY,
      });
    }
    return out;
  }, [people, pos]);

  // Where the "no reporting line" block starts, so it can be labelled and
  // ruled off. Derived from the positions rather than tracked separately, so
  // it stays correct after a card is dragged.
  const unattachedBand = useMemo(() => {
    const hasChild = new Set(people.map((p) => p.reports_to).filter(Boolean) as string[]);
    const loose = people.filter((p) => !p.reports_to && !hasChild.has(p.id));
    if (loose.length === 0) return null;
    const ys = loose.map((p) => pos[p.id]?.y).filter((y): y is number => typeof y === 'number');
    if (ys.length === 0) return null;
    return { y: Math.min(...ys) - 34, count: loose.length };
  }, [people, pos]);

  const extent = useMemo(() => {
    const xs = Object.values(pos).map((p) => p.x);
    const ys = Object.values(pos).map((p) => p.y);
    return {
      w: Math.max(1200, ...(xs.length ? xs : [0]).map((x) => x + CARD_W + 120)),
      h: Math.max(600, ...(ys.length ? ys : [0]).map((y) => y + CARD_H + 160)),
    };
  }, [pos]);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.full_name ?? 'Unknown';

  return (
    <div className="space-y-3">
      {msg && (
        <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
          msg.kind === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
            : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
        }`}>
          {msg.kind === 'ok' ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-[hsl(var(--muted))]">
          <Users2 className="h-4 w-4" />
          {canEdit
            ? 'Drag a card to move it. Drag the dot underneath a person onto someone else to make them report to that person.'
            : 'Reporting structure — read only.'}
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" title="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.2, +(z - 0.15).toFixed(2)))}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-[hsl(var(--muted))]">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="sm" title="Zoom in"
            onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.15).toFixed(2)))}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={fitToView} title="Fit the whole chart on screen">
            <Maximize2 className="h-4 w-4" /> Fit
          </Button>
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={autoArrange}>
              <RotateCcw className="h-4 w-4" /> Tidy up
            </Button>
          )}
        </div>
      </div>

      <div
        ref={canvasRef}
        className="relative overflow-auto rounded-xl border bg-[hsl(var(--surface))]"
        style={{ height: '70vh' }}
      >
        {/* Scaled surface. The wrapper reserves the SCALED footprint so the
            scrollbars match what is actually on screen — without it, zooming
            out leaves a large dead area and zooming in clips the right edge. */}
        <div style={{ width: extent.w * zoom, height: extent.h * zoom }}>
        <div
          className="relative origin-top-left"
          style={{ width: extent.w, height: extent.h, transform: `scale(${zoom})` }}
        >
          {/* Connections */}
          <svg className="pointer-events-none absolute inset-0" width={extent.w} height={extent.h}>
            {edges.map((e) => (
              <g key={e.id}>
                <path d={e.d} fill="none" stroke="hsl(var(--border))" strokeWidth={2} />
                {canEdit && (
                  <g
                    className="pointer-events-auto cursor-pointer"
                    onClick={() => setManager(e.childId, null)}
                  >
                    <circle cx={e.midX} cy={e.midY} r={9} fill="hsl(var(--background))" stroke="hsl(var(--border))" />
                    <title>Disconnect {nameOf(e.childId)}</title>
                    <path
                      d={`M ${e.midX - 3.5} ${e.midY} L ${e.midX + 3.5} ${e.midY}`}
                      stroke="#dc2626" strokeWidth={2} strokeLinecap="round"
                    />
                  </g>
                )}
              </g>
            ))}
            {/* The line being dragged */}
            {linkFrom && ghost && pos[linkFrom] && (
              <path
                d={`M ${pos[linkFrom].x + CARD_W / 2} ${pos[linkFrom].y + CARD_H} L ${ghost.x} ${ghost.y}`}
                fill="none" stroke="hsl(var(--brand))" strokeWidth={2} strokeDasharray="5 4"
              />
            )}
          </svg>

          {/* Divider for the people with no reporting line */}
          {unattachedBand && (
            <div
              className="pointer-events-none absolute left-0 flex items-center gap-3"
              style={{ top: unattachedBand.y, width: extent.w - 40 }}
            >
              <span className="whitespace-nowrap rounded-full border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
                No reporting line · {unattachedBand.count}
              </span>
              <span className="h-px flex-1 bg-[hsl(var(--border))]" />
            </div>
          )}

          {/* People */}
          {people.map((p) => {
            const pt = pos[p.id];
            if (!pt) return null;
            const isTarget = linkFrom && hoverId === p.id && p.id !== linkFrom;
            return (
              <div
                key={p.id}
                className={`absolute select-none rounded-xl border bg-[hsl(var(--background))] shadow-sm transition-shadow ${
                  canEdit ? 'cursor-grab active:cursor-grabbing' : ''
                } ${isTarget ? 'ring-2 ring-[hsl(var(--brand))]' : ''}`}
                data-person-id={p.id}
                style={{ left: pt.x, top: pt.y, width: CARD_W, height: CARD_H }}
                onPointerDown={(e) => startMove(e, p.id)}
              >
                <div className="h-1.5 rounded-t-xl" style={{ background: ROLE_TONE[p.role] ?? '#64748b' }} />
                <div className="px-3 py-1.5">
                  <p className="truncate text-sm font-semibold leading-tight" title={p.full_name ?? ''}>
                    {p.full_name ?? 'Unnamed'}
                  </p>
                  <p className="truncate text-[11px] text-[hsl(var(--muted))]">
                    {ROLE_LABEL[p.role] ?? p.role}
                  </p>
                </div>

                {canEdit && (
                  <button
                    type="button"
                    onPointerDown={(e) => startLink(e, p.id)}
                    title="Drag onto the person this one reports to"
                    className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--brand))] transition hover:scale-125"
                  />
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[hsl(var(--muted))]">
        {Object.entries(ROLE_LABEL).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ROLE_TONE[k] }} />{label}
          </span>
        ))}
        {canEdit && (
          <span className="flex items-center gap-1.5">
            <Link2Off className="h-3 w-3" /> Click the dash on a line to disconnect
          </span>
        )}
      </div>
    </div>
  );
}
