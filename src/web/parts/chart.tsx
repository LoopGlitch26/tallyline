import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Summary } from '../core/api';
import { bucketText, num } from '../core/format';

type Point = Summary['series'][number];

/** Round an axis maximum up so quarter ticks are whole numbers (1, 2, 4, 6, 8 x 10^n). */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 4, 6, 8, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

function smoothPath(pts: [number, number][]): string {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
}

export function TrafficChart({
  series,
  step,
  showVisitors,
  showRevenue,
  cash,
}: {
  series: Point[];
  step: string;
  showVisitors: boolean;
  showRevenue: boolean;
  cash: (minor: number, short?: boolean) => string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  const height = 300;

  useLayoutEffect(() => {
    if (wrap.current) setWidth(wrap.current.clientWidth);
  }, []);
  useEffect(() => {
    if (!wrap.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const pad = { top: 16, right: showRevenue ? 58 : 14, bottom: 28, left: 44 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const n = Math.max(1, series.length);
  const slot = w / n;

  const vMax = niceCeil(Math.max(...series.map((p) => p.visitors), 4));
  // Give revenue extra headroom so its bars sit low, under the visitors line.
  const rMax = niceCeil(Math.max(...series.map((p) => p.revenue), 1) * 1.6);
  const xAt = (i: number) => pad.left + slot * i + slot / 2;
  const yV = (v: number) => pad.top + h - (v / vMax) * h;
  const yR = (v: number) => pad.top + h - (Math.max(0, v) / rMax) * h;

  const line = series.map((p, i) => [xAt(i), yV(p.visitors)] as [number, number]);
  const linePath = smoothPath(line);
  const areaPath = line.length ? `${linePath} L${line[line.length - 1][0]},${pad.top + h} L${line[0][0]},${pad.top + h} Z` : '';

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 72))));
  const barW = Math.min(30, Math.max(2, slot * 0.55));

  function onMove(e: MouseEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = e.clientX - rect.left - pad.left;
    const i = Math.floor(x / slot);
    setHover(i >= 0 && i < n ? i : null);
  }

  const hp = hover !== null ? series[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max(xAt(hover) + 12, 8), width - 196) : 0;

  return (
    <div class="chart" ref={wrap}>
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Visitors and revenue over time">
        <defs>
          <linearGradient id="tl-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="var(--visitors)" stop-opacity="0.28" />
            <stop offset="100%" stop-color="var(--visitors)" stop-opacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g>
            <line x1={pad.left} x2={pad.left + w} y1={pad.top + h * (1 - t)} y2={pad.top + h * (1 - t)} class="grid" />
            <text x={pad.left - 8} y={pad.top + h * (1 - t) + 4} class="axis" text-anchor="end">
              {num(vMax * t)}
            </text>
            {showRevenue && (
              <text x={pad.left + w + 8} y={pad.top + h * (1 - t) + 4} class="axis">
                {cash(rMax * t, true)}
              </text>
            )}
          </g>
        ))}
        {series.map((p, i) =>
          i % labelEvery === 0 ? (
            <text x={xAt(i)} y={height - 8} class="axis" text-anchor="middle">
              {bucketText(p.key, step)}
            </text>
          ) : null,
        )}
        {hover !== null && <rect x={pad.left + slot * hover} y={pad.top} width={slot} height={h} class="hover-band" />}
        {showRevenue &&
          series.map((p, i) =>
            p.revenue > 0 ? <rect x={xAt(i) - barW / 2} y={yR(p.revenue)} width={barW} height={pad.top + h - yR(p.revenue)} rx={3} class="bar" /> : null,
          )}
        {showVisitors && (
          <>
            <path d={areaPath} fill="url(#tl-area)" />
            <path d={linePath} class="line" />
            {hover !== null && <circle cx={xAt(hover)} cy={yV(series[hover].visitors)} r={4.5} class="dot" />}
          </>
        )}
      </svg>
      {hp && (
        <div class="tip" style={{ left: `${tipLeft}px`, top: '12px' }}>
          <strong>{bucketText(hp.key, step, true)}</strong>
          <div>
            <i class="sw visitors" />
            Visitors <b>{num(hp.visitors)}</b>
          </div>
          <div>
            <i class="sw views" />
            Page views <b>{num(hp.views)}</b>
          </div>
          <div>
            <i class="sw revenue" />
            Revenue <b>{cash(hp.revenue)}</b>
          </div>
          {hp.payments > 0 && (
            <div>
              <i class="sw revenue soft" />
              Payments <b>{hp.payments}</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
