import { useState } from 'preact/hooks';
import { call, reportQuery } from '../core/api';
import { useBoard } from '../core/board';
import { num, pct } from '../core/format';
import { useFetch } from '../core/hooks';
import { Glyph } from '../parts/glyphs';
import { Shell } from '../parts/shell';
import { Skeleton } from '../parts/ui';
import { periodLine } from './overview';

interface Step {
  kind: 'page' | 'goal';
  match: string;
}
interface Funnel {
  id: string;
  title: string;
  steps: Step[];
}

export function FunnelsView() {
  const { property, view, version } = useBoard();
  const [rev, setRev] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: funnels } = useFetch<Funnel[]>(`/api/properties/${property.id}/funnels`, rev);
  const current = funnels?.find((f) => f.id === chosen) ?? funnels?.[0];
  const { data: report } = useFetch<(Step & { people: number })[]>(
    current ? `/api/properties/${property.id}/funnels/${current.id}/report?${reportQuery(view)}` : null,
    version + rev,
  );
  const first = report?.[0]?.people || 0;
  const last = report?.[report.length - 1]?.people || 0;

  return (
    <Shell title="Funnels" subtitle={periodLine()}>
      {!funnels && <Skeleton height={300} />}
      {funnels && (editing || funnels.length === 0) && (
        <FunnelEditor
          cancellable={funnels.length > 0}
          onClose={(id) => {
            setEditing(false);
            if (id) setChosen(id);
            setRev((r) => r + 1);
          }}
        />
      )}
      {funnels && !editing && funnels.length > 0 && current && (
        <div class="funnel-layout">
          <aside class="panel funnel-list">
            <header class="panel-head">
              <h3>Saved funnels</h3>
              <button class="icon-btn framed" onClick={() => setEditing(true)} aria-label="New funnel" title="New funnel">
                <Glyph name="plus" size={16} />
              </button>
            </header>
            <ul>
              {funnels.map((f) => (
                <li>
                  <button class={`funnel-pick${f.id === current.id ? ' on' : ''}`} onClick={() => setChosen(f.id)}>
                    <b class="ellipsis">{f.title}</b>
                    <small>{f.steps.length} steps</small>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section class="panel">
            <header class="panel-head">
              <div>
                <h3>{current.title}</h3>
                <p class="muted small">People who did these steps in this order during the period</p>
              </div>
              <div class="funnel-summary">
                <span>Overall</span>
                <b class="chrome">{first ? pct(last / first) : '—'}</b>
              </div>
            </header>
            {!report && <div class="pad"><Skeleton height={260} /></div>}
            {report && (
              <ol class="funnel-steps">
                {report.map((s, i) => {
                  const share = first ? s.people / first : 0;
                  const prev = i > 0 ? report[i - 1].people : s.people;
                  return (
                    <li>
                      <div class="fs-head">
                        <span class="fs-no">{i + 1}</span>
                        <span class="fs-kind">{s.kind === 'goal' ? 'Goal' : 'Page'}</span>
                        <span class="fs-name ellipsis" title={s.match}>
                          {s.match}
                        </span>
                        <span class="fs-count">
                          <b>{num(s.people)}</b> people
                        </span>
                      </div>
                      <div class="fs-track">
                        <i style={{ width: `${Math.max(0.6, share * 100)}%` }} />
                        <span>{pct(share, 0)}</span>
                      </div>
                      {i > 0 && prev > 0 && (
                        <div class="fs-drop">
                          {pct(s.people / prev, 0)} continued · {num(prev - s.people)} dropped off
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <footer class="panel-foot">
              {confirmDelete ? (
                <span class="confirm">
                  Delete "{current.title}"?
                  <button
                    class="btn danger"
                    onClick={async () => {
                      await call(`/api/properties/${property.id}/funnels/${current.id}`, { method: 'DELETE' });
                      setConfirmDelete(false);
                      setChosen(null);
                      setRev((r) => r + 1);
                    }}
                  >
                    Delete
                  </button>
                  <button class="btn ghost" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button class="link-btn danger" onClick={() => setConfirmDelete(true)}>
                  Delete funnel
                </button>
              )}
              <span />
            </footer>
          </section>
        </div>
      )}
    </Shell>
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
    <section class="panel">
      <header class="panel-head">
        <div>
          <h3>New funnel</h3>
          <p class="muted small">Steps count in order for each person. Use * in a page path to match many pages, for example /blog/*.</p>
        </div>
      </header>
      <form
        class="pad editor"
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
        <label class="lbl">
          Name
          <input id="funnel-title" class="field" value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <ol class="step-editor">
          {steps.map((s, i) => (
            <li>
              <span class="fs-no">{i + 1}</span>
              <div class="seg-ctrl small" role="group" aria-label={`Step ${i + 1} type`}>
                <button type="button" class={s.kind === 'page' ? 'on' : ''} onClick={() => edit(i, { kind: 'page' })}>
                  Page
                </button>
                <button type="button" class={s.kind === 'goal' ? 'on' : ''} onClick={() => edit(i, { kind: 'goal' })}>
                  Goal
                </button>
              </div>
              <input
                id={`funnel-step-${i}`}
                class="field mono"
                value={s.match}
                onInput={(e) => edit(i, { match: e.currentTarget.value })}
                placeholder={s.kind === 'page' ? '/pricing' : 'signup_click'}
              />
              <button type="button" class="icon-btn" disabled={steps.length <= 2} onClick={() => setSteps((all) => all.filter((_, j) => j !== i))} aria-label="Remove step">
                <Glyph name="close" size={15} />
              </button>
            </li>
          ))}
        </ol>
        <div class="row-actions">
          <button type="button" class="btn ghost" disabled={steps.length >= 10} onClick={() => setSteps((all) => [...all, { kind: 'page', match: '' }])}>
            <Glyph name="plus" size={15} /> Add step
          </button>
          <span class="grow" />
          {cancellable && (
            <button type="button" class="btn ghost" onClick={() => onClose()}>
              Cancel
            </button>
          )}
          <button class="btn primary">Save funnel</button>
        </div>
        {error && <p class="error">{error}</p>}
      </form>
    </section>
  );
}
