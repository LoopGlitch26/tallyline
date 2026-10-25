import { reportQuery, type Slice } from '../core/api';
import { useBoard } from '../core/board';
import { num, pct } from '../core/format';
import { useFetch } from '../core/hooks';
import { ShareBar, SliceTable } from '../parts/breakdown';
import { Shell } from '../parts/shell';
import { Empty, Skeleton } from '../parts/ui';
import { periodLine } from './overview';

function Goals() {
  const { property, view, version, cash, addFilter, summary } = useBoard();
  const { data } = useFetch<Slice[]>(`/api/properties/${property.id}/breakdown?${reportQuery(view, { by: 'goal' })}`, version);
  const visitors = summary?.now.visitors ?? 0;
  const top = Math.max(1, ...(data ?? []).map((g) => g.visitors));
  return (
    <section class="panel">
      <header class="panel-head">
        <h3>Goals</h3>
        <span class="muted small">Click a goal to see only the people who completed it</span>
      </header>
      {!data && <div class="pad"><Skeleton height={200} /></div>}
      {data && !data.length && (
        <Empty>
          No goals yet. Add <code>data-tally="signup_click"</code> to a button, or call <code>tally('event', 'signup')</code>.
        </Empty>
      )}
      {data && data.length > 0 && (
        <div class="goal-grid">
          {data.map((g) => (
            <button class="goal-card" onClick={() => addFilter('goal', g.label ?? '')}>
              <span class="goal-name">
                <span class="goal-dot">◆</span> {g.label}
              </span>
              <span class="goal-rate">{visitors ? pct(g.visitors / visitors) : '—'}</span>
              <span class="goal-bar">
                <i style={{ width: `${(g.visitors / top) * 100}%` }} />
              </span>
              <span class="goal-meta">
                <span>{num(g.visitors)} people</span>
                <span>{num(g.count ?? 0)} times</span>
                <span class="money-cell">{g.revenue ? cash(g.revenue, true) : '—'}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function BehaviorView() {
  return (
    <Shell title="Behavior" subtitle={periodLine()}>
      <Goals />
      <SliceTable title="Pages" dims={['page', 'landing', 'exit_page']} limit={12} countLabel={(by) => (by === 'page' ? 'Views' : undefined)} />
      <div class="cols">
        <SliceTable title="Outbound links" dims={['outbound']} limit={8} countLabel={() => 'Clicks'} />
        <SliceTable title="Hostnames" dims={['host_name']} limit={8} />
      </div>
      <div class="cols">
        <ShareBar by="device" title="Devices" />
        <SliceTable title="Browsers and systems" dims={['browser', 'os']} limit={6} />
      </div>
    </Shell>
  );
}
