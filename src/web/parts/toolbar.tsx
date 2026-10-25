import { useState } from 'preact/hooks';
import type { Property, Step, Summary, ViewState } from '../core/api';
import { ymd } from '../core/format';
import { go } from '../core/nav';
import { Favicon } from './icons';
import { Menu, MenuItem } from './ui';

export const PRESET_NAMES: [string, string][] = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['last24h', 'Last 24 hours'],
  ['last48h', 'Last 48 hours'],
  ['last7', 'Last 7 days'],
  ['last30', 'Last 30 days'],
  ['last90', 'Last 90 days'],
  ['last365', 'Last 12 months'],
  ['all', 'All time'],
];

const STEP_NAMES: [Step, string][] = [
  ['hour', 'By hour'],
  ['day', 'By day'],
  ['week', 'By week'],
  ['month', 'By month'],
];

const caret = <span class="caret">▾</span>;

export function Toolbar({
  property,
  properties,
  view,
  change,
  summary,
  refresh,
  busy,
}: {
  property: Property;
  properties: Property[];
  view: ViewState;
  change: (p: Partial<ViewState>) => void;
  summary: Summary | null;
  refresh: () => void;
  busy: boolean;
}) {
  const [from, setFrom] = useState(view.from ?? '');
  const [to, setTo] = useState(view.to ?? '');

  const rangeName =
    view.preset === 'range' && view.from
      ? view.from === view.to
        ? new Date(view.from + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
        : `${view.from} – ${view.to}`
      : PRESET_NAMES.find(([k]) => k === view.preset)?.[1] ?? 'Last 30 days';

  /** Step the whole window back or forward by its own length. */
  function shift(direction: -1 | 1) {
    if (!summary) return;
    const { start, end } = summary.period;
    const len = Math.max(end - start, 86_400_000);
    const nextStart = start + direction * len;
    if (nextStart > Date.now()) return;
    const nextEnd = Math.min(nextStart + len - 1, Date.now());
    change({ preset: 'range', from: ymd(nextStart, property.tz), to: ymd(nextEnd, property.tz) });
  }
  const atPresent = !summary || summary.period.end >= Date.now() - 60_000;
  const activeStep = view.step ?? summary?.period.step ?? 'day';

  return (
    <div class="toolbar">
      <Menu
        trigger={
          <button class="btn big">
            <Favicon domain={property.host} size={20} />
            <span class="ellipsis strong">{property.label}</span>
            {caret}
          </button>
        }
      >
        {(close) => (
          <>
            {properties.map((p) => (
              <MenuItem
                active={p.id === property.id}
                onClick={() => {
                  close();
                  go(`/p/${p.id}${location.search}`);
                }}
              >
                <Favicon domain={p.host} /> {p.label}
              </MenuItem>
            ))}
            <hr />
            <MenuItem onClick={() => go(`/p/${property.id}/setup`)}>Setup &amp; settings</MenuItem>
            <MenuItem onClick={() => go('/')}>All websites</MenuItem>
          </>
        )}
      </Menu>

      <div class="range">
        <button class="range-step" onClick={() => shift(-1)} aria-label="Earlier period">
          ‹
        </button>
        <Menu trigger={<button class="range-name">{rangeName} {caret}</button>}>
          {(close) => (
            <>
              {PRESET_NAMES.map(([k, label]) => (
                <MenuItem
                  active={view.preset === k}
                  onClick={() => {
                    close();
                    change({ preset: k, step: undefined });
                  }}
                >
                  {label}
                </MenuItem>
              ))}
              <hr />
              <form
                class="custom-range"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!from || !to) return;
                  close();
                  change({ preset: 'range', from, to: to < from ? from : to, step: undefined });
                }}
              >
                <label>Custom dates</label>
                <input type="date" class="field compact" value={from} onInput={(e) => setFrom(e.currentTarget.value)} />
                <input type="date" class="field compact" value={to} onInput={(e) => setTo(e.currentTarget.value)} />
                <button class="btn primary">Apply</button>
              </form>
            </>
          )}
        </Menu>
        <button class="range-step" onClick={() => shift(1)} disabled={atPresent} aria-label="Later period">
          ›
        </button>
      </div>

      <Menu trigger={<button class="btn">{STEP_NAMES.find(([k]) => k === activeStep)?.[1]} {caret}</button>}>
        {(close) =>
          STEP_NAMES.map(([k, label]) => (
            <MenuItem
              active={activeStep === k}
              onClick={() => {
                close();
                change({ step: k });
              }}
            >
              {label}
            </MenuItem>
          ))
        }
      </Menu>

      <button class="btn square" onClick={refresh} aria-label="Refresh" title="Refresh">
        <span class={busy ? 'spin' : ''}>↻</span>
      </button>
    </div>
  );
}
