import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { bucketText } from '../core/format';

/** Round an axis maximum up so quarter ticks land on readable numbers. */
export function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

function curve(pts: [number, number][]): string {
  if (!pts.length) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
}

function useWidth(min = 280) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useLayoutEffect(() => {
    if (ref.current) setW(Math.max(min, ref.current.clientWidth));
  }, []);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export interface ChartProps {
  keys: string[];
  previousKeys: string[];
  current: number[];
  previous: (number | undefined)[];
  step: string;
  compare: boolean;
  format: (v: number, short?: boolean) => string;
  label: string;
  lowerIsBetter?: boolean;
}

/** Main trend chart: the selected metric, with the previous period as a dashed line. */
export function TrendChart({ keys, previousKeys, current, previous, step, compare, format, label, lowerIsBetter }: ChartProps) {
  const [wrap, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const height = 300;
  const pad = { top: 18, right: 16, bottom: 30, left: 58 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const n = current.length;
  const prevVals = previous.map((v) => v ?? 0);
  const max = niceCeil(Math.max(...current, ...(compare ? prevVals : []), 0) * 1.08);
  const x = (i: number) => pad.left + (n <= 1 ? w / 2 : (w * i) / (n - 1));
  const y = (v: number) => pad.top + h - (Math.max(0, v) / max) * h;

  const cur = current.map((v, i) => [x(i), y(v)] as [number, number]);
  const prev = previous.map((v, i) => (v === undefined ? null : ([x(i), y(v)] as [number, number]))).filter(Boolean) as [number, number][];
  const line = curve(cur);
  const area = cur.length ? `${line} L${cur[cur.length - 1][0]},${pad.top + h} L${cur[0][0]},${pad.top + h} Z` : '';
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 86))));

  function move(e: MouseEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const rel = e.clientX - r.left - pad.left;
    const i = n <= 1 ? 0 : Math.round((rel / w) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  }

  const hv = hover !== null ? current[hover] : 0;
  const hp = hover !== null ? previous[hover] : undefined;
  const change = hp ? (hv - hp) / hp : null;
  const good = change === null ? null : lowerIsBetter ? change <= 0 : change >= 0;
  const tipX = hover !== null ? Math.min(Math.max(x(hover) + 14, 8), width - 214) : 0;

  return (
    <div class="trend" ref={wrap}>
      <svg width={width} height={height} onMouseMove={move} onMouseLeave={() => setHover(null)} role="img" aria-label={`${label} over time`}>
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22" />
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="trend-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stop-color="var(--accent-deep)" />
            <stop offset="55%" stop-color="var(--accent)" />
            <stop offset="100%" stop-color="var(--accent-bright)" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g>
            <line class="grid" x1={pad.left} x2={pad.left + w} y1={y(max * t)} y2={y(max * t)} />
            <text class="axis" x={pad.left - 10} y={y(max * t) + 4} text-anchor="end">
              {format(max * t, true)}
            </text>
          </g>
        ))}
        {keys.map((k, i) =>
          i % every === 0 ? (
            <text class="axis" x={x(i)} y={height - 9} text-anchor={i === 0 ? 'start' : 'middle'}>
              {bucketText(k, step)}
            </text>
          ) : null,
        )}
        {compare && prev.length > 1 && <path d={curve(prev)} class="prev-line" />}
        <path d={area} fill="url(#trend-fill)" />
        <path d={line} class="cur-line" />
        {hover !== null && (
          <g>
            <line class="cursor" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + h} />
            {compare && hp !== undefined && <circle class="prev-dot" cx={x(hover)} cy={y(hp)} r={3.5} />}
            <circle class="cur-dot" cx={x(hover)} cy={y(hv)} r={5} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div class="trend-tip" style={{ left: `${tipX}px`, top: '8px' }}>
          <div class="tip-row">
            <i class="key cur" />
            <span>{bucketText(keys[hover], step, true)}</span>
            <b>{format(hv)}</b>
          </div>
          {compare && previousKeys[hover] && (
            <div class="tip-row muted">
              <i class="key prev" />
              <span>{bucketText(previousKeys[hover], step, true)}</span>
              <b>{format(hp ?? 0)}</b>
            </div>
          )}
          {compare && change !== null && Number.isFinite(change) && (
            <div class={`tip-change ${good ? 'up' : 'down'}`}>
              {change >= 0 ? '+' : ''}
              {Math.round(change * 100)}% vs previous
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Tiny trend line for metric tiles. */
export function Sparkline({ values, width = 120, height = 34 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...values, 1e-9);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / (max - min || 1)) * (height - 8)] as [number, number]);
  const d = curve(pts);
  const last = pts[pts.length - 1];
  return (
    <svg class="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={`${d} L${last[0]},${height} L${pts[0][0]},${height} Z`} class="spark-fill" />
      <path d={d} class="spark-line" />
      <circle cx={last[0]} cy={last[1]} r={2.6} class="spark-dot" />
    </svg>
  );
}
