import { useCallback, useMemo, useState } from 'preact/hooks';
import { reportQuery, type Property, type Summary, type Totals } from '../core/api';
import { BoardContext, DIMENSION_NAMES, type Board } from '../core/board';
import { duration, money, num, pct } from '../core/format';
import { useFetch, useViewState } from '../core/hooks';
import { go } from '../core/nav';
import { BreakdownCard, SliceLabel } from '../parts/breakdown';
import { TrafficChart } from '../parts/chart';
import { ConversionsCard } from '../parts/conversions';
import { PersonDrawer } from '../parts/person';
import { Toolbar } from '../parts/toolbar';
import { Delta, Skeleton } from '../parts/ui';

export function BoardView({ pid }: { pid: string }) {
  const [view, change] = useViewState();
  const [version, setVersion] = useState(0);
  const [person, setPerson] = useState<string | null>(null);
  const [hide, setHide] = useState({ visitors: false, revenue: false });
  const { data: properties } = useFetch<Property[]>('/api/properties');
  const property = properties?.find((p) => p.id === pid);
  const { data: summary, loading } = useFetch<Summary>(property ? `/api/properties/${pid}/summary?${reportQuery(view)}` : null, version);

  const addFilter = useCallback((dim: string, value: string) => change({ filters: { ...view.filters, [dim]: value } }), [view.filters, change]);
  const dropFilter = (dim: string) => {
    const next = { ...view.filters };
    delete next[dim];
    change({ filters: next });
  };

  const board = useMemo<Board | null>(() => {
    if (!property) return null;
    const digits = summary?.digits ?? 2;
    return {
      property,
      view,
      version,
      digits,
      cash: (minor, short) => money(minor, property.currency, digits, short),
      addFilter,
      openPerson: setPerson,
    };
  }, [property, view, version, summary?.digits, addFilter]);

  if (properties && !property)
    return (
      <div class="page narrow center">
        <p>That website doesn't exist (or was deleted).</p>
        <button class="btn" onClick={() => go('/')}>
          Back to websites
        </button>
      </div>
    );
  if (!board || !property) return <div class="page"><Skeleton height={500} /></div>;

  const now = summary?.now;
  const before = summary?.before;
  const kpis: { key: keyof Totals; label: string; text: (t: Totals) => string; series?: 'visitors' | 'revenue'; lowerIsBetter?: boolean }[] = [
    { key: 'visitors', label: 'Visitors', text: (t) => num(t.visitors), series: 'visitors' },
    { key: 'revenue', label: 'Revenue', text: (t) => board.cash(t.revenue, true), series: 'revenue' },
    { key: 'conversionRate', label: 'Conversion', text: (t) => pct(t.conversionRate) },
    { key: 'revenuePerVisitor', label: 'Revenue / visitor', text: (t) => board.cash(t.revenuePerVisitor) },
    { key: 'bounceRate', label: 'Bounce rate', text: (t) => pct(t.bounceRate, 0), lowerIsBetter: true },
    { key: 'avgEngagedMs', label: 'Visit duration', text: (t) => duration(t.avgEngagedMs) },
  ];

  return (
    <BoardContext.Provider value={board}>
      <div class="page">
        <Toolbar
          property={property}
          properties={properties!}
          view={view}
          change={change}
          summary={summary}
          refresh={() => setVersion((v) => v + 1)}
          busy={loading}
        />

        {Object.keys(view.filters).length > 0 && (
          <div class="chips">
            {Object.entries(view.filters).map(([dim, value]) => (
              <span class="chip">
                <span class="muted">{DIMENSION_NAMES[dim] ?? dim}</span>
                <span class="chip-value">
                  <SliceLabel by={dim} label={value || null} />
                </span>
                <button class="icon-btn" onClick={() => dropFilter(dim)} aria-label="Remove filter">
                  ✕
                </button>
              </span>
            ))}
            <button class="link" onClick={() => change({ filters: {} })}>
              Clear filters
            </button>
          </div>
        )}

        <section class="card overview">
          <div class="kpis">
            {now && before
              ? kpis.map((k) => (
                  <button
                    class={`kpi${k.series ? ' toggle' : ''}`}
                    onClick={() => k.series && setHide((h) => ({ ...h, [k.series!]: !h[k.series!] }))}
                    title={k.series ? 'Show or hide on the chart' : undefined}
                  >
                    <span class="kpi-label">
                      {k.series && <i class={`sw ${k.series}${hide[k.series] ? ' off' : ''}`} />}
                      {k.label}
                    </span>
                    <span class="kpi-value">{k.text(now)}</span>
                    <Delta now={now[k.key]} before={before[k.key]} lowerIsBetter={k.lowerIsBetter} />
                  </button>
                ))
              : kpis.map(() => (
                  <div class="kpi">
                    <Skeleton height={58} />
                  </div>
                ))}
            <div class="kpi">
              <span class="kpi-label">
                <i class="live" /> Online now
              </span>
              <span class="kpi-value">{summary ? num(summary.online) : '·'}</span>
            </div>
          </div>
          {summary ? (
            <TrafficChart series={summary.series} step={summary.period.step} showVisitors={!hide.visitors} showRevenue={!hide.revenue} cash={board.cash} />
          ) : (
            <Skeleton height={300} />
          )}
        </section>

        <div class="grid-2">
          <BreakdownCard dims={['channel', 'source', 'campaign', 'keyword', 'tag']} />
          <BreakdownCard dims={['country', 'region', 'city']} />
          <BreakdownCard dims={['page', 'landing', 'exit_page', 'outbound', 'host_name']} />
          <BreakdownCard dims={['device', 'browser', 'os']} />
        </div>

        <ConversionsCard visitors={now?.visitors ?? 0} />

        <footer class="foot">
          Times in {property.tz} · Revenue in {property.currency} ·{' '}
          <button class="link" onClick={() => go(`/p/${property.id}/setup`)}>
            Setup &amp; settings
          </button>
        </footer>
      </div>
      <PersonDrawer key={person ?? 'none'} uid={person} onClose={() => setPerson(null)} />
    </BoardContext.Provider>
  );
}
