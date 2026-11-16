'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Point { label: string; value: number }

/**
 * Single-series column chart (DESIGN_SYSTEM charts): one hue (primary), 4px rounded data-ends on a zero baseline,
 * recessive grid, hover tooltip per column, selective direct label on the latest value, and a visually-hidden table.
 */
export function ColumnChart({ points, format, axisLabel, height = 200, testId }: { points: Point[]; format: (v: number) => string; axisLabel: (label: string) => string; height?: number; testId?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const W = 600;
  const H = height;
  const pad = { top: 16, bottom: 28, left: 8, right: 8 };
  const plotH = H - pad.top - pad.bottom;
  const band = (W - pad.left - pad.right) / Math.max(1, points.length);
  const bar = Math.min(48, band * 0.56);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const last = points.length - 1;
  return (
    <figure className="relative" data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setHover(null)}>
        <title id={`${id}-t`}>{points.map((p) => `${axisLabel(p.label)}: ${format(p.value)}`).join('; ')}</title>
        {ticks.map((v, i) => <line key={i} x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} strokeDasharray={i === 0 ? undefined : '3 4'} />)}
        {points.map((p, i) => {
          const cx = pad.left + band * i + band / 2;
          const h = Math.max(p.value > 0 ? 2 : 0, (p.value / max) * plotH);
          const top = pad.top + plotH - h;
          const r = Math.min(4, h / 2, bar / 2);
          return (
            <g key={p.label} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${axisLabel(p.label)}: ${format(p.value)}`} data-point={p.label}>
              <rect x={cx - band / 2} y={pad.top} width={band} height={plotH} fill="transparent" />
              {h > 0 && <path d={`M${cx - bar / 2},${pad.top + plotH} V${top + r} Q${cx - bar / 2},${top} ${cx - bar / 2 + r},${top} H${cx + bar / 2 - r} Q${cx + bar / 2},${top} ${cx + bar / 2},${top + r} V${pad.top + plotH} Z`}
                className={cn('fill-primary transition-opacity', hover !== null && hover !== i && 'opacity-40')} />}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-fg-muted text-[11px]">{axisLabel(p.label)}</text>
              {i === last && p.value > 0 && <text x={cx} y={top - 6} textAnchor="middle" className="fill-fg text-[11px] font-semibold">{format(p.value)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && points[hover] && (
        <div role="status" className="pointer-events-none absolute top-0 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs shadow-md"
          style={{ insetInlineStart: `${Math.min(80, Math.max(0, ((hover + 0.5) / points.length) * 100 - 10))}%` }}>
          <p className="text-fg-muted">{axisLabel(points[hover].label)}</p><p className="tabular font-semibold text-fg">{format(points[hover].value)}</p>
        </div>
      )}
      <table className="sr-only"><tbody>{points.map((p) => <tr key={p.label}><th>{axisLabel(p.label)}</th><td>{format(p.value)}</td></tr>)}</tbody></table>
    </figure>
  );
}

/** Ranked horizontal bars with the value as text (identity by label, magnitude by length — one hue). */
export function BarList({ rows, format, empty }: { rows: { key: string; label: ReactNode; value: number; hint?: ReactNode }[]; format: (v: number) => string; empty: ReactNode }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-fg-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1" data-row={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 truncate text-fg">{r.label}{r.hint && <span className="ms-1.5 text-xs text-fg-muted">{r.hint}</span>}</span><span className="tabular shrink-0 font-medium text-fg">{format(r.value)}</span></div>
          <div className="h-2 rounded-full bg-subtle"><div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
