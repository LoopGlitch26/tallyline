import { useBoard } from '../core/board';
import { clock, country, duration, nickname, span, stamp } from '../core/format';
import { useFetch } from '../core/hooks';
import { Avatar, BrowserMark, DeviceMark, Flag, OsMark, SourceMark } from './icons';
import { Drawer, Skeleton } from './ui';

interface Hit {
  vsn: string;
  at: number;
  kind: 'view' | 'conversion' | 'exit';
  label: string | null;
  path: string | null;
  meta: string | null;
}

interface Profile {
  person: { uid: string; first_at: number; display_name: string | null; email: string | null; ext_id: string | null } | null;
  visits: any[];
  hits: Hit[];
  charges: any[];
}

/** Everything one visitor did, newest visit first. Parent remounts it per uid. */
export function PersonDrawer({ uid, onClose }: { uid: string | null; onClose: () => void }) {
  const { property, cash } = useBoard();
  const { data: p } = useFetch<Profile>(uid ? `/api/properties/${property.id}/people/${encodeURIComponent(uid)}` : null);

  const latest = p?.visits[0];
  const firstVisit = p?.visits[p.visits.length - 1];
  const spent = p?.charges.reduce((sum, c) => sum + c.amount_minor, 0) ?? 0;
  const firstCharge = p?.charges.filter((c) => c.kind === 'charge').at(-1);
  const hitsByVisit = new Map<string, Hit[]>();
  for (const h of p?.hits ?? []) {
    const list = hitsByVisit.get(h.vsn) ?? [];
    list.push(h);
    hitsByVisit.set(h.vsn, list);
  }

  return (
    <Drawer open={!!uid} onClose={onClose} title="Visitor">
      {!p && <Skeleton height={320} />}
      {p && uid && (
        <div class="person">
          <div class="person-head">
            <Avatar seed={uid} size={60} />
            <div>
              <h2>{p.person?.display_name || p.person?.email || nickname(uid)}</h2>
              {p.person?.email && p.person.display_name && <div class="muted">{p.person.email}</div>}
              {latest && (
                <div class="who-meta">
                  <span>
                    <Flag code={latest.country} size={13} /> {latest.city ? `${latest.city}, ` : ''}
                    {country(latest.country)}
                  </span>
                  <span>
                    <DeviceMark name={latest.device} /> {latest.device}
                  </span>
                  <span>
                    <OsMark name={latest.os} /> {latest.os}
                  </span>
                  <span>
                    <BrowserMark name={latest.browser} /> {latest.browser}
                  </span>
                </div>
              )}
            </div>
          </div>

          <dl class="facts">
            <div>
              <dt>First source</dt>
              <dd>{firstVisit?.source ?? '—'}</dd>
            </div>
            <div>
              <dt>Visits</dt>
              <dd>{p.visits.length}</dd>
            </div>
            <div>
              <dt>Total spent</dt>
              <dd class={spent > 0 ? 'money' : ''}>{cash(spent)}</dd>
            </div>
            <div>
              <dt>Time to first payment</dt>
              <dd>{firstCharge && p.person ? span(Math.max(0, firstCharge.at - p.person.first_at)) : '—'}</dd>
            </div>
          </dl>

          <ol class="timeline">
            {p.visits.map((v) => {
              const hits = [...(hitsByVisit.get(v.vsn) ?? [])].reverse();
              const paid = p.charges.filter((c) => c.at >= v.began && c.at <= v.last_active + 30 * 60_000);
              // one list in time order; on a tie the hit (a checkout click) stays before the payment it led to
              const rows = [...hits.map((h) => ({ at: h.at, h })), ...paid.map((c) => ({ at: c.at, c }))].sort(
                (a, b) => a.at - b.at,
              );
              return (
                <li>
                  <div class="visit-head">
                    <b>{stamp(v.began, property.tz)}</b>
                    <span class="pill">
                      <SourceMark source={v.source} host={v.ref_host} size={13} /> {v.source}
                    </span>
                    {v.ref_url && <span class="muted ellipsis">{v.ref_url}</span>}
                    {v.utm_campaign && <span class="pill warm">campaign: {v.utm_campaign}</span>}
                    {v.tag && <span class="pill warm">ref: {v.tag}</span>}
                    <span class="muted">{duration(v.engaged_ms)}</span>
                  </div>
                  <ul class="hits">
                    {rows.map((r) =>
                      'h' in r ? (
                        <li>
                          <time>{clock(r.h.at, property.tz)}</time>
                          {r.h.kind === 'view' && <span>📄 {r.h.path}</span>}
                          {r.h.kind === 'conversion' && (
                            <span class="goal">
                              ◎ {r.h.label} <span class="muted">on {r.h.path}</span>
                            </span>
                          )}
                          {r.h.kind === 'exit' && <span class="muted">↗ left for {r.h.label?.replace(/^https?:\/\//, '')}</span>}
                        </li>
                      ) : (
                        <li>
                          <time>{clock(r.c.at, property.tz)}</time>
                          <span class="money strong">
                            {r.c.kind === 'refund' ? '↩ Refunded' : '● Paid'} {cash(r.c.amount_minor)}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                </li>
              );
            })}
          </ol>

          {p.charges.length > 0 && (
            <div class="ledger">
              <h4>Payments</h4>
              {p.charges.map((c) => (
                <div class="ledger-row">
                  <span>
                    {stamp(c.at, property.tz)} · {c.kind === 'refund' ? 'Refund' : c.recurring ? 'Renewal' : 'Payment'}
                  </span>
                  <b>{cash(c.amount_minor)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
