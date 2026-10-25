import { useState } from 'preact/hooks';
import { call, reportQuery } from '../core/api';
import { useBoard } from '../core/board';
import { num, pct, span, stamp } from '../core/format';
import { useFetch } from '../core/hooks';
import { ShareBar } from '../parts/breakdown';
import { Glyph } from '../parts/glyphs';
import { SourceMark } from '../parts/icons';
import { Shell } from '../parts/shell';
import { Empty, Skeleton } from '../parts/ui';
import { Who } from '../parts/who';
import { periodLine } from './overview';

const VIA: Record<string, { label: string; tip: string }> = {
  metadata: { label: 'Checkout metadata', tip: 'Visitor id passed into the checkout' },
  return_visit: { label: 'Return page', tip: 'Buyer landed on your thank-you page with the payment id' },
  prior_charge: { label: 'Earlier payment', tip: 'Same customer paid before (renewal or repeat)' },
  email: { label: 'Email match', tip: "Email matched someone you identify()'d" },
  timing: { label: 'Checkout timing', tip: 'Only one visitor clicked checkout just before paying' },
};

const SEARCH_FIELDS = ['display_name', 'email', 'charge_email', 'charge_name', 'source', 'country', 'city', 'uid', 'utm_campaign', 'tag'];
const matches = (r: Record<string, any>, q: string) => !q || SEARCH_FIELDS.some((k) => String(r[k] ?? '').toLowerCase().includes(q.toLowerCase()));

export function RevenueView() {
  const { property, view, version, cash, openPerson, summary } = useBoard();
  const [rev, setRev] = useState(0);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const [relink, setRelink] = useState<string | null>(null);
  const [report, setReport] = useState<{ id: string; name: string | null; linked: boolean; note: string | null }[]>([]);
  const { data } = useFetch<any[]>(`/api/properties/${property.id}/buyers?${reportQuery(view)}`, version + rev);

  const total = data?.length ?? 0;
  const linked = data?.filter((r) => r.uid).length ?? 0;
  const byVia = new Map<string, number>();
  for (const r of data ?? []) byVia.set(r.linked_via ?? 'none', (byVia.get(r.linked_via ?? 'none') ?? 0) + 1);
  const repeat = data?.filter((r) => r.recurring).length ?? 0;
  const rows = (data ?? []).filter((r) => matches(r, query));

  return (
    <Shell title="Revenue" subtitle={periodLine()}>
      <div class="stat-strip">
        <div class="stat">
          <span>Net revenue</span>
          <b class="chrome">{summary ? cash(summary.now.revenue) : '—'}</b>
        </div>
        <div class="stat">
          <span>Payments</span>
          <b>{summary ? num(summary.now.payments) : '—'}</b>
        </div>
        <div class="stat">
          <span>New customers</span>
          <b>{summary ? num(summary.now.customers) : '—'}</b>
        </div>
        <div class="stat">
          <span>Repeat payments</span>
          <b>{data ? num(repeat) : '—'}</b>
        </div>
        <div class="stat">
          <span>Linked to a source</span>
          <b>{data && total ? pct(linked / total, linked < total && linked / total > 0.99 ? 1 : 0) : '—'}</b>
        </div>
      </div>

      <div class="cols">
        <ShareBar by="source" title="Revenue by source" value="revenue" />
        <section class="panel">
          <header class="panel-head">
            <h3>How payments were matched</h3>
          </header>
          {!data ? (
            <div class="pad"><Skeleton height={120} /></div>
          ) : (
            <ul class="match-list">
              {[...Object.keys(VIA), 'none'].map((k) => {
                const n = byVia.get(k) ?? 0;
                return (
                  <li title={VIA[k]?.tip ?? 'No visitor id and no fallback match'}>
                    <span class={`match-dot ${k}`} />
                    <span class="ellipsis">{VIA[k]?.label ?? 'Not matched'}</span>
                    <span class="match-bar">
                      <i class={k} style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                    </span>
                    <b>{n}</b>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section class="panel">
        <header class="panel-head">
          <h3>Payments</h3>
          <label class="search-field small">
            <Glyph name="search" size={15} />
            <input id="revenue-search" placeholder="Search name, email, source…" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
          </label>
        </header>
        {data && total - linked > 0 && (
          <div class="notice">
            <span>
              <b>{total - linked}</b> payment{total - linked === 1 ? ' is' : 's are'} not linked to a visitor yet.
            </span>
            <button
              class="btn"
              disabled={relink === 'busy'}
              onClick={async () => {
                setRelink('busy');
                const r = await call<{ checked: number; linked: number; report: typeof report }>(`/api/properties/${property.id}/relink`, { method: 'POST' });
                setRelink(`Linked ${r.linked} of ${r.checked}`);
                setReport(r.report);
                setRev((x) => x + 1);
              }}
            >
              {relink === 'busy' ? 'Matching…' : relink ?? 'Try matching again'}
            </button>
            {report.length > 0 && (
              <ul class="notice-list">
                {report.map((r) => (
                  <li>
                    <b>{r.name ?? r.id}</b>: {r.linked ? 'linked' : 'not linked'}
                    {r.note ? `. ${r.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {!data && <div class="pad"><Skeleton height={360} /></div>}
        {data && !data.length && <Empty>No payments in this period. Connect Dodo Payments or the payments API in Setup.</Empty>}
        {data && data.length > 0 && (
          <div class="table-scroll">
            <table class="grid-table people">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Credited to</th>
                  <th class="num">Amount</th>
                  <th>Time to buy</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, all || query ? undefined : 12).map((r) => (
                  <tr class={r.uid ? 'clickable' : ''} onClick={() => r.uid && openPerson(r.uid)}>
                    <td>
                      <Who
                        uid={r.uid ?? r.id}
                        name={r.display_name ?? r.charge_name}
                        email={r.email ?? r.charge_email}
                        countryCode={r.country}
                        device={r.device}
                        os={r.os}
                        browser={r.browser}
                        badge={<span class={`badge ${r.recurring ? 'repeat' : 'new'}`}>{r.recurring ? 'Repeat' : 'New'}</span>}
                      />
                    </td>
                    <td>
                      {r.vsn ? (
                        <div class="src-cell">
                          <SourceMark source={r.source} host={r.ref_host} />
                          <div>
                            <div>{r.source}</div>
                            <div class="muted small">
                              {[r.utm_campaign || r.tag, r.linked_via && r.linked_via !== 'metadata' ? `via ${VIA[r.linked_via]?.label.toLowerCase() ?? r.linked_via}` : null].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span class="badge none" title="No visitor id in the payment and no fallback match">
                          Unattributed
                        </span>
                      )}
                    </td>
                    <td class="num strong">{cash(r.amount_minor)}</td>
                    <td>
                      {r.first_at ? span(Math.max(0, r.at - r.first_at)) : '—'}
                      {r.visit_count > 0 && (
                        <div class="muted small">
                          {r.visit_count} visit{r.visit_count === 1 ? '' : 's'}
                        </div>
                      )}
                    </td>
                    <td class="nowrap muted">{stamp(r.at, property.tz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && !query && !all && rows.length > 12 && (
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
