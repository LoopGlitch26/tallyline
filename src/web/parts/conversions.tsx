import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { call, reportQuery, type Slice } from '../core/api';
import { useBoard } from '../core/board';
import { country, duration, nickname, num, pct, span, stamp } from '../core/format';
import { useFetch } from '../core/hooks';
import { Avatar, BrowserMark, DeviceMark, Flag, OsMark, SourceMark } from './icons';
import { Empty, Skeleton, Tabs } from './ui';

type Pane = 'buyers' | 'goals' | 'funnels' | 'people';

export function ConversionsCard({ visitors }: { visitors: number }) {
  const [pane, setPane] = useState<Pane>('buyers');
  const [query, setQuery] = useState('');
  return (
    <section class="card conversions">
      <header class="card-head">
        <Tabs
          value={pane}
          options={[
            { value: 'buyers', label: 'Revenue journey' },
            { value: 'goals', label: 'Goals' },
            { value: 'funnels', label: 'Funnels' },
            { value: 'people', label: 'People' },
          ]}
          onChange={setPane}
        />
        {(pane === 'buyers' || pane === 'people') && (
          <input class="field search" placeholder="Search name, email, source…" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        )}
      </header>
      <div class="card-body">
        {pane === 'goals' && <Goals visitors={visitors} />}
        {pane === 'funnels' && <Funnels />}
        {pane === 'people' && <People query={query} />}
        {pane === 'buyers' && <Buyers query={query} />}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ goals

function Goals({ visitors }: { visitors: number }) {
  const { property, view, version, cash, addFilter } = useBoard();
  const { data } = useFetch<Slice[]>(`/api/properties/${property.id}/breakdown?${reportQuery(view, { by: 'goal' })}`, version);
  if (!data) return <Skeleton />;
  if (!data.length)
    return (
      <Empty>
        No goals yet. Put <code>data-tally="signup_click"</code> on a button, or call <code>tally('event', 'signup')</code>.
      </Empty>
    );
  return (
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Goal</th>
            <th class="r">People</th>
            <th class="r">Completions</th>
            <th class="r">Conversion</th>
            <th class="r">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.map((g) => (
            <tr class="pickable" onClick={() => addFilter('goal', g.label ?? '')} title="Show only people who completed this goal">
              <td>
                <span class="goal-name">◎ {g.label}</span>
              </td>
              <td class="r">{num(g.visitors)}</td>
              <td class="r">{num(g.count ?? 0)}</td>
              <td class="r">{visitors ? pct(g.visitors / visitors) : '—'}</td>
              <td class="r">{cash(g.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ funnels

interface Step {
  kind: 'page' | 'goal';
  match: string;
}
interface Funnel {
  id: string;
  title: string;
  steps: Step[];
}

function Funnels() {
  const { property, view, version } = useBoard();
  const [rev, setRev] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const { data: funnels } = useFetch<Funnel[]>(`/api/properties/${property.id}/funnels`, rev);
  const current = funnels?.find((f) => f.id === chosen) ?? funnels?.[0];
  const { data: report } = useFetch<(Step & { people: number })[]>(
    current ? `/api/properties/${property.id}/funnels/${current.id}/report?${reportQuery(view)}` : null,
    version + rev,
  );

  if (!funnels) return <Skeleton />;
  if (editing || funnels.length === 0)
    return (
      <FunnelEditor
        cancellable={funnels.length > 0}
        onClose={(id) => {
          setEditing(false);
          if (id) setChosen(id);
          setRev((r) => r + 1);
        }}
      />
    );

  const first = report?.[0]?.people || 0;
  return (
    <div class="funnel">
      <div class="funnel-bar">
        <select class="field compact" value={current?.id} onChange={(e) => setChosen(e.currentTarget.value)}>
          {funnels.map((f) => (
            <option value={f.id}>{f.title}</option>
          ))}
        </select>
        <button class="btn" onClick={() => setEditing(true)}>
          New funnel
        </button>
        {current && (
          <button
            class="btn danger"
            onClick={async () => {
              if (!confirm(`Delete the funnel "${current.title}"?`)) return;
              await call(`/api/properties/${property.id}/funnels/${current.id}`, { method: 'DELETE' });
              setChosen(null);
              setRev((r) => r + 1);
            }}
          >
            Delete
          </button>
        )}
      </div>
      <ol class="funnel-steps">
        {report?.map((s, i) => {
          const share = first ? s.people / first : 0;
          const prev = i > 0 ? report[i - 1].people : s.people;
          return (
            <li>
              <div class="funnel-col">
                <div class="funnel-fill" style={{ height: `${Math.max(2, share * 100)}%` }}>
                  {share >= 0.15 && <span>{pct(share, 0)}</span>}
                </div>
              </div>
              <div class="funnel-name" title={s.match}>
                <span class="step-no">{i + 1}</span>
                {s.kind === 'goal' ? '◎ ' : ''}
                {s.match}
              </div>
              <div class="muted">
                {num(s.people)} people · {pct(share, 0)}
              </div>
              {i > 0 && <div class="drop">{prev ? pct(1 - s.people / prev, 0) : '0%'} dropped</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FunnelEditor({ onClose, cancellable }: { onClose: (id?: string) => void; cancellable: boolean }) {
  const { property } = useBoard();
  const [title, setTitle] = useState('Visit → pricing → checkout');
  const [steps, setSteps] = useState<Step[]>([
    { kind: 'page', match: '/' },
    { kind: 'page', match: '/pricing' },
    { kind: 'goal', match: 'checkout_click' },
  ]);
  const [error, setError] = useState('');
  const edit = (i: number, patch: Partial<Step>) => setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <form
      class="funnel-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        try {
          const f = await call<Funnel>(`/api/properties/${property.id}/funnels`, { body: { title, steps } });
          onClose(f.id);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <p class="muted">People are counted once they complete the steps in order. Use * in page paths, e.g. /blog/*.</p>
      <input class="field" value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="Funnel name" />
      {steps.map((s, i) => (
        <div class="step-row">
          <span class="step-no">{i + 1}</span>
          <select class="field compact" value={s.kind} onChange={(e) => edit(i, { kind: e.currentTarget.value as Step['kind'] })}>
            <option value="page">Page</option>
            <option value="goal">Goal</option>
          </select>
          <input class="field" value={s.match} onInput={(e) => edit(i, { match: e.currentTarget.value })} placeholder={s.kind === 'page' ? '/pricing' : 'signup_click'} />
          <button type="button" class="icon-btn" disabled={steps.length <= 2} onClick={() => setSteps((all) => all.filter((_, j) => j !== i))} aria-label="Remove step">
            ✕
          </button>
        </div>
      ))}
      <div class="row-actions">
        <button type="button" class="btn" disabled={steps.length >= 10} onClick={() => setSteps((all) => [...all, { kind: 'page', match: '' }])}>
          Add step
        </button>
        <button class="btn primary">Save funnel</button>
        {cancellable && (
          <button type="button" class="btn" onClick={() => onClose()}>
            Cancel
          </button>
        )}
      </div>
      {error && <p class="error">{error}</p>}
    </form>
  );
}

// ------------------------------------------------------------------ people & buyers

function Who({ uid, name, email, countryCode, city, device, os, browser, badge }: Record<string, any> & { badge?: ComponentChildren }) {
  return (
    <div class="who">
      <Avatar seed={uid} size={40} />
      <div class="who-text">
        <div class="who-name">
          <span class="ellipsis">{name || email || nickname(uid)}</span>
          {badge}
        </div>
        <div class="who-meta">
          <span>
            <Flag code={countryCode} size={13} /> {city ? `${city}, ` : ''}
            {country(countryCode)}
          </span>
          <span>
            <DeviceMark name={device} /> {device}
          </span>
          <span>
            <OsMark name={os} /> {os}
          </span>
          <span>
            <BrowserMark name={browser} /> {browser}
          </span>
        </div>
      </div>
    </div>
  );
}

const SEARCH_FIELDS = ['display_name', 'email', 'charge_email', 'charge_name', 'source', 'country', 'city', 'uid', 'utm_campaign', 'tag'];
const matches = (r: Record<string, any>, q: string) => !q || SEARCH_FIELDS.some((k) => String(r[k] ?? '').toLowerCase().includes(q.toLowerCase()));

function ShowMore({ total, open, onOpen }: { total: number; open: boolean; onOpen: () => void }) {
  if (open || total <= 10) return null;
  return (
    <button class="more" onClick={onOpen}>
      Show all {total}
    </button>
  );
}

const VIA_TEXT: Record<string, string> = {
  return_visit: 'return page',
  prior_charge: 'earlier payment',
  email: 'email match',
  timing: 'checkout timing',
};

function Buyers({ query }: { query: string }) {
  const { property, view, version, cash, openPerson } = useBoard();
  const [all, setAll] = useState(false);
  const [rev, setRev] = useState(0);
  const [relink, setRelink] = useState<string | null>(null);
  const [report, setReport] = useState<{ id: string; name: string | null; linked: boolean; note: string | null }[]>([]);
  const { data } = useFetch<any[]>(`/api/properties/${property.id}/buyers?${reportQuery(view)}`, version + rev);
  if (!data) return <Skeleton />;
  if (!data.length) return <Empty>No payments in this period. Connect Dodo Payments (or the payments API) in setup to see who paid and what brought them.</Empty>;
  const orphans = data.filter((r) => !r.uid).length;
  const rows = data.filter((r) => matches(r, query));
  return (
    <>
      {orphans > 0 && (
        <div class="notice">
          <span>
            {orphans} payment{orphans === 1 ? '' : 's'} not linked to a visitor yet.
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
                  <b>{r.name ?? r.id}</b> — {r.linked ? 'linked' : 'not linked'}
                  {r.note ? `: ${r.note}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div class="table-wrap">
        <table class="table people-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Credited source</th>
              <th class="r">Paid</th>
              <th>Time to buy</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, all || query ? undefined : 10).map((r) => (
              <tr class={r.uid ? 'pickable' : ''} onClick={() => r.uid && openPerson(r.uid)}>
                <td>
                  <Who
                    uid={r.uid ?? r.id}
                    name={r.display_name ?? r.charge_name}
                    email={r.email ?? r.charge_email}
                    countryCode={r.country}
                    device={r.device}
                    os={r.os}
                    browser={r.browser}
                    badge={<span class="badge money">{r.recurring ? 'Repeat' : 'New'}</span>}
                  />
                </td>
                <td>
                  {r.vsn ? (
                    <div class="src-cell">
                      <SourceMark source={r.source} host={r.ref_host} />
                      <div>
                        <div>{r.source}</div>
                        {(r.utm_campaign || r.tag) && <div class="muted small">{r.utm_campaign || r.tag}</div>}
                        {r.linked_via && r.linked_via !== 'metadata' && <div class="muted small">via {VIA_TEXT[r.linked_via] ?? r.linked_via}</div>}
                      </div>
                    </div>
                  ) : (
                    <span class="muted" title="No visitor id in the payment and no fallback match">
                      Unattributed
                    </span>
                  )}
                </td>
                <td class="r strong">{cash(r.amount_minor)}</td>
                <td>
                  {r.first_at ? span(Math.max(0, r.at - r.first_at)) : '—'}
                  {r.visit_count > 0 && (
                    <div class="muted small">
                      {r.visit_count} visit{r.visit_count === 1 ? '' : 's'}
                    </div>
                  )}
                </td>
                <td class="nowrap">{stamp(r.at, property.tz)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!query && <ShowMore total={rows.length} open={all} onOpen={() => setAll(true)} />}
    </>
  );
}

function People({ query }: { query: string }) {
  const { property, view, version, cash, openPerson } = useBoard();
  const [all, setAll] = useState(false);
  const { data } = useFetch<any[]>(`/api/properties/${property.id}/people?${reportQuery(view)}`, version);
  if (!data) return <Skeleton />;
  if (!data.length) return <Empty>No visitors in this period.</Empty>;
  const rows = data.filter((r) => matches(r, query));
  return (
    <>
      <div class="table-wrap">
        <table class="table people-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Latest source</th>
              <th class="r">Visits</th>
              <th class="r">Pages</th>
              <th class="r">Time</th>
              <th class="r">Spent</th>
              <th class="r">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, all || query ? undefined : 10).map((r) => (
              <tr class="pickable" onClick={() => openPerson(r.uid)}>
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
                    badge={r.spent > 0 ? <span class="badge money">Customer</span> : null}
                  />
                </td>
                <td>
                  <div class="src-cell">
                    <SourceMark source={r.source} host={r.ref_host} /> {r.source}
                  </div>
                </td>
                <td class="r">{r.visits}</td>
                <td class="r">{r.views}</td>
                <td class="r">{duration(r.engaged_ms)}</td>
                <td class="r">{r.spent ? cash(r.spent) : '—'}</td>
                <td class="r muted nowrap">{span(Date.now() - r.last_active)} ago</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!query && <ShowMore total={rows.length} open={all} onOpen={() => setAll(true)} />}
    </>
  );
}
