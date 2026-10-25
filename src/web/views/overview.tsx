import { useState } from 'preact/hooks';
import { reportQuery } from '../core/api';
import { useBoard } from '../core/board';
import { span } from '../core/format';
import { useFetch } from '../core/hooks';
import { metricByKey, type MetricKey } from '../core/metrics';
import { SliceTable } from '../parts/breakdown';
import { TrendChart } from '../parts/chart';
import { Glyph } from '../parts/glyphs';
import { SourceMark } from '../parts/icons';
import { Shell, rangeName } from '../parts/shell';
import { MetricTiles } from '../parts/tiles';
import { Empty, Skeleton } from '../parts/ui';
import { Who } from '../parts/who';

export function periodLine(): string {
  const { property, view, compare } = useBoard();
  const r = rangeName(view.preset, view.from, view.to);
  return `${property.host} · ${r}${compare ? ' compared with the period before' : ''}`;
}

function RecentPayments() {
  const { property, view, version, cash, openPerson, goSection } = useBoard();
  const { data } = useFetch<any[]>(`/api/properties/${property.id}/buyers?${reportQuery(view)}`, version);
  return (
    <section class="panel">
      <header class="panel-head">
        <h3>Latest payments</h3>
      </header>
      {!data && <div class="pad"><Skeleton height={300} /></div>}
      {data && !data.length && <Empty>No payments in this period yet.</Empty>}
      {data && data.length > 0 && (
        <ul class="feed">
          {data.slice(0, 7).map((r) => (
            <li>
              <button class="feed-row" onClick={() => r.uid && openPerson(r.uid)} disabled={!r.uid}>
                <Who uid={r.uid ?? r.id} name={r.display_name ?? r.charge_name} email={r.email ?? r.charge_email} countryCode={r.country} compact />
                <span class="feed-src">
                  {r.vsn ? (
                    <>
                      <SourceMark source={r.source} host={r.ref_host} size={14} />
                      <span class="ellipsis">{r.utm_campaign || r.source}</span>
                    </>
                  ) : (
                    <span class="dim">Unattributed</span>
                  )}
                </span>
                <span class="feed-amt">
                  <b>{cash(r.amount_minor)}</b>
                  <small>{span(Date.now() - r.at)} ago</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <footer class="panel-foot">
        <span />
        <button class="link-btn" onClick={() => goSection('revenue')}>
          All payments <Glyph name="arrow" size={14} />
        </button>
      </footer>
    </section>
  );
}

export function OverviewView() {
  const { summary, cash, compare, setCompare } = useBoard();
  const [metric, setMetric] = useState<MetricKey>('revenue');
  const m = metricByKey(metric);

  return (
    <Shell title="Overview" subtitle={periodLine()} actions>
      <section class="panel hero">
        <MetricTiles summary={summary} active={metric} onPick={setMetric} />
        <div class="hero-chart">
          <div class="chart-head">
            <div class="legend-inline">
              <span>
                <i class="key cur" /> {m.label}
              </span>
              {compare && (
                <span class="muted">
                  <i class="key prev" /> Previous period
                </span>
              )}
            </div>
            <label class="toggle">
              <input id="compare-toggle" type="checkbox" checked={compare} onChange={(e) => setCompare(e.currentTarget.checked)} />
              <span class="track" />
              Compare
            </label>
          </div>
          {summary ? (
            <TrendChart
              keys={summary.series.map((p) => p.key)}
              previousKeys={summary.previousSeries.map((p) => p.key)}
              current={summary.series.map(m.point)}
              previous={summary.series.map((_, i) => (summary.previousSeries[i] ? m.point(summary.previousSeries[i]) : undefined))}
              step={summary.period.step}
              compare={compare}
              format={(v, short) => m.format(v, cash, short)}
              label={m.label}
              lowerIsBetter={m.lowerIsBetter}
            />
          ) : (
            <Skeleton height={300} />
          )}
        </div>
      </section>

      <div class="cols">
        <SliceTable title="Top sources" dims={['source', 'channel', 'campaign']} limit={7} more={{ section: 'acquisition', label: 'Acquisition' }} />
        <RecentPayments />
        <SliceTable title="Top pages" dims={['page', 'landing']} limit={7} more={{ section: 'behavior', label: 'Behavior' }} countLabel={(by) => (by === 'page' ? 'Views' : undefined)} />
        <SliceTable title="Locations" dims={['country', 'city']} limit={7} more={{ section: 'acquisition', label: 'All locations' }} />
      </div>
    </Shell>
  );
}
