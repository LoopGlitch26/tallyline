import { useState } from 'preact/hooks';
import { reportQuery } from '../core/api';
import { useBoard } from '../core/board';
import { duration, span } from '../core/format';
import { useFetch } from '../core/hooks';
import { Glyph } from '../parts/glyphs';
import { SourceMark } from '../parts/icons';
import { Shell } from '../parts/shell';
import { Empty, Skeleton, Tabs } from '../parts/ui';
import { Who } from '../parts/who';
import { periodLine } from './overview';

export function PeopleView() {
  const { property, view, version, cash, openPerson } = useBoard();
  const [query, setQuery] = useState('');
  const [who, setWho] = useState<'all' | 'customers' | 'known'>('all');
  const [all, setAll] = useState(false);
  const { data } = useFetch<any[]>(`/api/properties/${property.id}/people?${reportQuery(view)}`, version);
  const q = query.toLowerCase();
  const rows = (data ?? [])
    .filter((r) => (who === 'customers' ? r.spent > 0 : who === 'known' ? r.email || r.display_name : true))
    .filter((r) => !q || ['display_name', 'email', 'source', 'country', 'city', 'uid'].some((k) => String(r[k] ?? '').toLowerCase().includes(q)));

  return (
    <Shell title="People" subtitle={periodLine()}>
      <section class="panel">
        <header class="panel-head">
          <Tabs
            value={who}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'customers', label: 'Customers' },
              { value: 'known', label: 'Identified' },
            ]}
            onChange={setWho}
          />
          <label class="search-field small">
            <Glyph name="search" size={15} />
            <input id="people-search" placeholder="Search name, email, place…" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
          </label>
        </header>
        {!data && <div class="pad"><Skeleton height={420} /></div>}
        {data && !rows.length && <Empty>No one matches in this period.</Empty>}
        {rows.length > 0 && (
          <div class="table-scroll">
            <table class="grid-table people">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Latest source</th>
                  <th class="num">Visits</th>
                  <th class="num">Pages</th>
                  <th class="num">Time</th>
                  <th class="num">Spent</th>
                  <th class="num">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, all || query ? undefined : 15).map((r) => (
                  <tr class="clickable" onClick={() => openPerson(r.uid)}>
                    <td>
                      <Who
                        uid={r.uid}
                        name={r.display_name}
                        email={r.email}
                        countryCode={r.country}
                        city={r.city}
                        device={r.device}
                        os={r.os}
                        browser={r.browser}
                        badge={r.spent > 0 ? <span class="badge new">Customer</span> : null}
                      />
                    </td>
                    <td>
                      <div class="src-cell">
                        <SourceMark source={r.source} host={r.ref_host} /> {r.source}
                      </div>
                    </td>
                    <td class="num">{r.visits}</td>
                    <td class="num">{r.views}</td>
                    <td class="num">{duration(r.engaged_ms)}</td>
                    <td class="num money-cell">{r.spent ? cash(r.spent) : <span class="dim">—</span>}</td>
                    <td class="num muted nowrap">{span(Date.now() - r.last_active)} ago</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!query && !all && rows.length > 15 && (
          <footer class="panel-foot">
            <button class="link-btn" onClick={() => setAll(true)}>
              Show all {rows.length}
            </button>
            <span />
          </footer>
        )}
      </section>
    </Shell>
  );
}
