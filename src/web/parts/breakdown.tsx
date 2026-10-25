import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { reportQuery, type Slice } from '../core/api';
import { DIMENSION_NAMES, useBoard } from '../core/board';
import { country, num, pct } from '../core/format';
import { useFetch } from '../core/hooks';
import { BrowserMark, ChannelMark, DeviceMark, Favicon, Flag, OsMark, SourceMark } from './icons';
import { Dialog, Empty, Skeleton, Tabs } from './ui';

/** Dimensions whose rows can't be used as a filter. */
const NOT_FILTERABLE = new Set(['outbound']);

/** Icon + text for one row label. */
export function SliceLabel({ by, label, extra }: { by: string; label: string | null; extra?: string | null }) {
  const t = (s: ComponentChildren) => <span class="ellipsis">{s}</span>;
  switch (by) {
    case 'channel':
      return <>{<ChannelMark channel={label} />}{t(label)}</>;
    case 'source':
      return <>{<SourceMark source={label} host={extra} />}{t(label ?? 'Direct')}</>;
    case 'country':
      return <>{<Flag code={label} />}{t(country(label))}</>;
    case 'region':
    case 'city':
      return <>{<Flag code={extra} />}{t(label ?? 'Unknown')}</>;
    case 'browser':
      return <>{<BrowserMark name={label} />}{t(label)}</>;
    case 'os':
      return <>{<OsMark name={label} />}{t(label)}</>;
    case 'device':
      return <>{<DeviceMark name={label} />}{t(label)}</>;
    case 'host_name':
      return <>{<Favicon domain={label} />}{t(label)}</>;
    case 'referrer':
      return <>{<Favicon domain={label?.split('/')[0]} />}{t(label ?? '(none)')}</>;
    case 'outbound': {
      let host: string | null = null;
      try {
        host = label ? new URL(label).hostname : null;
      } catch {
        host = null;
      }
      return <>{<Favicon domain={host} />}{t(label?.replace(/^https?:\/\/(www\.)?/, ''))}</>;
    }
    case 'goal':
      return <>{<span class="glyph">◎</span>}{t(label)}</>;
    default:
      return t(label ?? <span class="muted">(none)</span>);
  }
}

type SortKey = 'visitors' | 'revenue';

function Rows({ rows, by, sort, limit, onPick }: { rows: Slice[]; by: string; sort: SortKey; limit: number; onPick?: (s: Slice) => void }) {
  const { cash } = useBoard();
  const ordered = useMemo(() => [...rows].sort((a, b) => b[sort] - a[sort] || b.visitors - a.visitors), [rows, sort]);
  const topV = Math.max(1, ...rows.map((r) => r.visitors));
  const topR = Math.max(1, ...rows.map((r) => r.revenue));
  const earns = rows.some((r) => r.revenue > 0);
  return (
    <ul class="rows">
      {ordered.slice(0, limit).map((r) => {
        // Visitors take the first ~65% of the row, revenue the rest, so both read at a glance.
        const vw = (r.visitors / topV) * (earns ? 65 : 100);
        const rw = earns ? (Math.max(0, r.revenue) / topR) * 35 : 0;
        return (
          <li class={onPick ? 'pickable' : ''} onClick={() => onPick?.(r)} title={onPick ? 'Click to filter by this' : undefined}>
            <span class="meter">
              <span class="meter-v" style={{ width: `${vw}%` }} />
              {rw > 0 && <span class="meter-r" style={{ width: `${rw}%` }} />}
            </span>
            <span class="row-label">
              <SliceLabel by={by} label={r.label} extra={r.extra} />
            </span>
            <span class="row-value">
              {r.revenue !== 0 && sort === 'visitors' && <span class="row-money">{cash(r.revenue, true)}</span>}
              {sort === 'revenue' ? cash(r.revenue, true) : num(r.visitors)}
            </span>
            <span class="row-tip">
              <b>{r.label ?? '(none)'}</b>
              <span>Visitors</span>
              <span>{num(r.visitors)}</span>
              {r.count !== undefined && by === 'page' && (
                <>
                  <span>Views</span>
                  <span>{num(r.count)}</span>
                </>
              )}
              <span>Revenue</span>
              <span>{cash(r.revenue)}</span>
              <span>Customers</span>
              <span>{r.customers}</span>
              <span>Conversion</span>
              <span>{r.visitors ? pct(r.customers / r.visitors) : '—'}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function BreakdownCard({ dims }: { dims: string[] }) {
  const { property, view, version, addFilter, cash } = useBoard();
  const [by, setBy] = useState(dims[0]);
  const [sort, setSort] = useState<SortKey>('visitors');
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState('');
  const { data, loading, error } = useFetch<Slice[]>(`/api/properties/${property.id}/breakdown?${reportQuery(view, { by })}`, version);
  const filterable = !NOT_FILTERABLE.has(by);

  const pick = filterable
    ? (s: Slice) => {
        setFull(false);
        addFilter(by, s.label ?? '');
      }
    : undefined;

  const searched = (data ?? []).filter((r) => !query || (r.label ?? '').toLowerCase().includes(query.toLowerCase()));

  return (
    <section class="card breakdown">
      <header class="card-head">
        <Tabs value={by} options={dims.map((d) => ({ value: d, label: DIMENSION_NAMES[d] }))} onChange={setBy} />
        <button class="sort" onClick={() => setSort((s) => (s === 'visitors' ? 'revenue' : 'visitors'))} title="Sort by visitors or revenue">
          {sort === 'visitors' ? 'Visitors' : 'Revenue'} ⇅
        </button>
      </header>
      <div class={`card-body${loading && !data ? ' loading' : ''}`}>
        {error && <p class="error">{error}</p>}
        {!data && !error && <Skeleton height={380} />}
        {data && data.length === 0 && <Empty>Nothing recorded in this period.</Empty>}
        {data && data.length > 0 && <Rows rows={data} by={by} sort={sort} limit={10} onPick={pick} />}
      </div>
      {data && data.length > 10 && (
        <button class="more" onClick={() => setFull(true)}>
          View all {data.length}
        </button>
      )}
      <Dialog open={full} onClose={() => setFull(false)} title={DIMENSION_NAMES[by]} wide>
        <input class="field" placeholder="Search…" value={query} onInput={(e) => setQuery(e.currentTarget.value)} autoFocus />
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{DIMENSION_NAMES[by]}</th>
                <th class="r">Visitors</th>
                <th class="r">Revenue</th>
                <th class="r">Customers</th>
                <th class="r">Conv.</th>
                <th class="r">Rev / visitor</th>
              </tr>
            </thead>
            <tbody>
              {searched.map((r) => (
                <tr class={pick ? 'pickable' : ''} onClick={() => pick?.(r)}>
                  <td class="label-cell">
                    <SliceLabel by={by} label={r.label} extra={r.extra} />
                  </td>
                  <td class="r">{num(r.visitors)}</td>
                  <td class="r">{cash(r.revenue)}</td>
                  <td class="r">{r.customers}</td>
                  <td class="r">{r.visitors ? pct(r.customers / r.visitors) : '—'}</td>
                  <td class="r">{r.visitors ? cash(r.revenue / r.visitors) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Dialog>
    </section>
  );
}
