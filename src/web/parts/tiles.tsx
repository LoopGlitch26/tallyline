import type { Summary } from '../core/api';
import { useBoard } from '../core/board';
import { METRICS, type MetricKey } from '../core/metrics';
import { Sparkline } from './chart';
import { Skeleton } from './ui';

function Change({ now, before, lowerIsBetter }: { now: number; before: number; lowerIsBetter?: boolean }) {
  if (!before) return <span class="pill flat">New</span>;
  const c = (now - before) / before;
  if (!Number.isFinite(c)) return null;
  const good = lowerIsBetter ? c <= 0 : c >= 0;
  return (
    <span class={`pill ${good ? 'up' : 'down'}`}>
      {c >= 0 ? '↑' : '↓'} {Math.abs(c * 100) >= 100 ? Math.round(Math.abs(c * 100)) : Math.abs(c * 100).toFixed(1)}%
    </span>
  );
}

/** One tile per headline metric. Clicking a tile puts that metric on the chart. */
export function MetricTiles({ summary, active, onPick }: { summary: Summary | null; active: MetricKey; onPick: (k: MetricKey) => void }) {
  const { cash } = useBoard();
  return (
    <div class="tiles" role="tablist" aria-label="Metrics">
      {METRICS.map((m) => (
        <button role="tab" aria-selected={active === m.key} class={`tile${active === m.key ? ' on' : ''}${m.money ? ' money' : ''}`} onClick={() => onPick(m.key)} title={m.hint}>
          <span class="tile-label">{m.label}</span>
          {summary ? (
            <>
              <span class="tile-value">{m.format(m.total(summary.now), cash, true)}</span>
              <span class="tile-foot">
                <Change now={m.total(summary.now)} before={m.total(summary.before)} lowerIsBetter={m.lowerIsBetter} />
                <Sparkline values={summary.series.map(m.point)} width={84} height={26} />
              </span>
            </>
          ) : (
            <Skeleton height={48} />
          )}
        </button>
      ))}
    </div>
  );
}
