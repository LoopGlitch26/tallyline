import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { reportQuery, type Slice } from '../core/api';
import { DIMENSION_NAMES, useBoard, type Section } from '../core/board';
import { country, num, pct } from '../core/format';
import { useFetch } from '../core/hooks';
import { Glyph } from './glyphs';
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
      return <>{<span class="glyph goal-dot">◆</span>}{t(label)}</>;
    case 'page':
    case 'landing':
    case 'exit_page':
      return <span class="ellipsis mono-path">{label ?? '(none)'}</span>;
    default:
      return t(label ?? <span class="muted">(none)</span>);
  }
}

type SortKey = 'visitors' | 'revenue';

function useSlices(by: string) {
  const { property, view, version } = useBoard();
  return useFetch<Slice[]>(`/api/properties/${property.id}/breakdown?${reportQuery(view, { by })}`, version);
}

function sortSlices(rows: Slice[], sort: SortKey) {
  return [...rows].sort((a, b) => b[sort] - a[sort] || b.visitors - a.visitors);
}

/** A table row with a soft bar behind the label showing its share. */
function SliceRows({ rows, by, sort, onPick, countLabel }: { rows: Slice[]; by: string; sort: SortKey; onPick?: (s: Slice) => void; countLabel?: string }) {
  const { cash } = useBoard();
  const topV = Math.max(1, ...rows.map((r) => r.visitors));
  const topR = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <tbody>
      {rows.map((r) => {
        const share = sort === 'revenue' ? Math.max(0, r.revenue) / topR : r.visitors / topV;
        return (
          <tr class={onPick ? 'clickable' : ''} onClick={() => onPick?.(r)} title={onPick ? 'Filter the dashboard by this' : undefined}>
            <td class="cell-label">
              <span class={`share ${sort}`} style={{ width: `${Math.max(1.5, share * 100)}%` }} />
              <span class="label-in">
                <SliceLabel by={by} label={r.label} extra={r.extra} />
              </span>
            </td>
            {countLabel && <td class="num">{num(r.count ?? 0)}</td>}
            <td class="num">{num(r.visitors)}</td>
            <td class="num money-cell">{r.revenue ? cash(r.revenue, true) : <span class="dim">—</span>}</td>
            <td class="num hide-sm">{r.visitors && r.customers ? pct(r.customers / r.visitors) : <span class="dim">—</span>}</td>
          </tr>
        );
      })}
    </tbody>
  );
}

function Head({ first, sort, setSort, countLabel }: { first: string; sort: SortKey; setSort: (s: SortKey) => void; countLabel?: string }) {
  return (
    <thead>
      <tr>
        <th>{first}</th>
        {countLabel && <th class="num">{countLabel}</th>}
        <th class="num">
          <button class={`th-sort${sort === 'visitors' ? ' on' : ''}`} onClick={() => setSort('visitors')}>
            Visitors
          </button>
        </th>
        <th class="num">
          <button class={`th-sort${sort === 'revenue' ? ' on' : ''}`} onClick={() => setSort('revenue')}>
            Revenue
          </button>
        </th>
        <th class="num hide-sm">Conv.</th>
      </tr>
    </thead>
  );
}

/**
 * A card with tabs over several related dimensions, shown as a table.
 * Clicking a row filters every view; "See all" opens the full list with search.
 */
export function SliceTable({
  title,
  dims,
  limit = 8,
  more,
  countLabel,
}: {
  title: string;
  dims: string[];
  limit?: number;
  more?: { section: Section; label: string };
  countLabel?: (by: string) => string | undefined;
}) {
  const { addFilter, goSection } = useBoard();
  const [by, setBy] = useState(dims[0]);
  const [sort, setSort] = useState<SortKey>('visitors');
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState('');
  const { data, error } = useSlices(by);
  const rows = useMemo(() => sortSlices(data ?? [], sort), [data, sort]);
  const pick = NOT_FILTERABLE.has(by)
    ? undefined
    : (s: Slice) => {
        setFull(false);
        addFilter(by, s.label ?? '');
      };
  const cl = countLabel?.(by);
  const searched = rows.filter((r) => !query || (r.label ?? '').toLowerCase().includes(query.toLowerCase()));

  return (
    <section class="panel">
      <header class="panel-head">
        <h3>{title}</h3>
        {dims.length > 1 && <Tabs value={by} options={dims.map((d) => ({ value: d, label: DIMENSION_NAMES[d] }))} onChange={setBy} />}
      </header>
      {error && <p class="error pad">{error}</p>}
      {!data && !error && <div class="pad"><Skeleton height={limit * 40} /></div>}
      {data && data.length === 0 && <Empty>No {DIMENSION_NAMES[by].toLowerCase()} data in this period.</Empty>}
      {data && data.length > 0 && (
        <div class="table-scroll">
          <table class="grid-table">
            <Head first={DIMENSION_NAMES[by]} sort={sort} setSort={setSort} countLabel={cl} />
            <SliceRows rows={rows.slice(0, limit)} by={by} sort={sort} onPick={pick} countLabel={cl} />
          </table>
        </div>
      )}
      {data && (data.length > limit || more) && (
        <footer class="panel-foot">
          {data.length > limit ? (
            <button class="link-btn" onClick={() => setFull(true)}>
              See all {data.length}
            </button>
          ) : (
            <span />
          )}
          {more && (
            <button class="link-btn" onClick={() => goSection(more.section)}>
              {more.label} <Glyph name="arrow" size={14} />
            </button>
          )}
        </footer>
      )}
      <Dialog open={full} onClose={() => setFull(false)} title={DIMENSION_NAMES[by]} wide>
        <label class="search-field">
          <Glyph name="search" size={16} />
          <input placeholder={`Search ${DIMENSION_NAMES[by].toLowerCase()}…`} value={query} onInput={(e) => setQuery(e.currentTarget.value)} autoFocus />
        </label>
        <div class="table-scroll">
          <table class="grid-table">
            <Head first={DIMENSION_NAMES[by]} sort={sort} setSort={setSort} countLabel={cl} />
            <SliceRows rows={searched} by={by} sort={sort} onPick={pick} countLabel={cl} />
          </table>
        </div>
      </Dialog>
    </section>
  );
}

/** One horizontal bar split into segments (e.g. share of visitors per channel). */
export function ShareBar({ by, title, value = 'visitors' }: { by: string; title: string; value?: SortKey }) {
  const { cash, addFilter } = useBoard();
  const { data } = useSlices(by);
  if (!data) return <section class="panel pad"><Skeleton height={86} /></section>;
  const rows = sortSlices(data, value).filter((r) => r[value] > 0);
  const total = rows.reduce((s, r) => s + r[value], 0) || 1;
  const top = rows.slice(0, 6);
  const rest = rows.slice(6).reduce((s, r) => s + r[value], 0);
  return (
    <section class="panel share-panel">
      <header class="panel-head">
        <h3>{title}</h3>
      </header>
      <div class="pad">
        <div class="sharebar">
          {top.map((r, i) => (
            <span class={`seg s${i}`} style={{ width: `${(r[value] / total) * 100}%` }} title={`${r.label}: ${value === 'revenue' ? cash(r[value]) : num(r[value])}`} />
          ))}
          {rest > 0 && <span class="seg rest" style={{ width: `${(rest / total) * 100}%` }} />}
        </div>
        <ul class="legend">
          {top.map((r, i) => (
            <li>
              <button class="legend-item" onClick={() => addFilter(by, r.label ?? '')}>
                <i class={`sw s${i}`} />
                <span class="ellipsis">{r.label ?? '(none)'}</span>
                <b>{pct(r[value] / total, 0)}</b>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
