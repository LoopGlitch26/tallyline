import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { call, type Step } from '../core/api';
import { DIMENSION_NAMES, SECTIONS, useBoard } from '../core/board';
import { num, ymd } from '../core/format';
import { go } from '../core/nav';
import { Wordmark } from '../views/wordmark';
import { SliceLabel } from './breakdown';
import { Glyph, type GlyphName } from './glyphs';
import { Favicon } from './icons';
import { Palette } from './palette';
import { ALL_RANGES, QUICK_RANGES } from '../core/ranges';
import { Menu, MenuItem } from './ui';

const STEPS: [Step, string][] = [
  ['hour', 'Hourly'],
  ['day', 'Daily'],
  ['week', 'Weekly'],
  ['month', 'Monthly'],
];

export function rangeName(preset: string, from?: string, to?: string): string {
  if (preset === 'range' && from) {
    const f = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return from === to ? f(from) : `${f(from)} – ${f(to ?? from)}`;
  }
  return ALL_RANGES.find(([k]) => k === preset)?.[1] ?? 'Last 30 days';
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { property, properties, section, goSection, summary } = useBoard();
  return (
    <>
      {open && <div class="side-scrim" onClick={onClose} />}
      <nav class={`side${open ? ' open' : ''}`} aria-label="Main">
        <div class="side-top">
          <Wordmark />
        </div>
        <Menu
          trigger={
            <button class="site-switch">
              <Favicon domain={property.host} size={20} />
              <span class="site-text">
                <b class="ellipsis">{property.label}</b>
                <small class="ellipsis">{property.host}</small>
              </span>
              <Glyph name="chevron" size={16} />
            </button>
          }
        >
          {(close) => (
            <>
              <div class="menu-label">Websites</div>
              {properties.map((p) => (
                <MenuItem
                  active={p.id === property.id}
                  onClick={() => {
                    close();
                    go(`/p/${p.id}/${section}${location.search}`);
                  }}
                >
                  <Favicon domain={p.host} /> <span class="ellipsis">{p.label}</span>
                </MenuItem>
              ))}
              <hr />
              <MenuItem onClick={() => go('/')}>
                <Glyph name="plus" size={15} /> Add or manage websites
              </MenuItem>
            </>
          )}
        </Menu>
        <ul class="nav">
          {SECTIONS.filter((s) => s.key !== 'setup').map((s) => (
            <li>
              <button
                class={`nav-item${section === s.key ? ' on' : ''}`}
                onClick={() => {
                  goSection(s.key);
                  onClose();
                }}
                aria-current={section === s.key ? 'page' : undefined}
              >
                <Glyph name={s.key as GlyphName} />
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        <div class="side-bottom">
          {summary && (
            <div class="live-card">
              <span class="live" />
              <div>
                <b>{num(summary.online)}</b> online now
              </div>
            </div>
          )}
          <button
            class={`nav-item${section === 'setup' ? ' on' : ''}`}
            onClick={() => {
              goSection('setup');
              onClose();
            }}
          >
            <Glyph name="setup" /> Setup &amp; settings
          </button>
          <button
            class="nav-item"
            onClick={async () => {
              await call('/api/session', { method: 'DELETE' }).catch(() => {});
              dispatchEvent(new Event('tallyline:signed-out'));
            }}
          >
            <Glyph name="logout" /> Sign out
          </button>
        </div>
      </nav>
    </>
  );
}

function RangeControl() {
  const { view, change, summary, property } = useBoard();
  const [from, setFrom] = useState(view.from ?? '');
  const [to, setTo] = useState(view.to ?? '');
  const quick = QUICK_RANGES.some(([k]) => k === view.preset);

  function shift(dir: -1 | 1) {
    if (!summary) return;
    const { start, end } = summary.period;
    const len = Math.max(end - start, 86_400_000);
    const s = start + dir * len;
    if (s > Date.now()) return;
    change({ preset: 'range', from: ymd(s, property.tz), to: ymd(Math.min(s + len - 1, Date.now()), property.tz) });
  }
  const atPresent = !summary || summary.period.end >= Date.now() - 60_000;

  return (
    <div class="range">
      <button class="icon-btn" onClick={() => shift(-1)} aria-label="Earlier period">
        <Glyph name="left" size={16} />
      </button>
      <div class="seg-ctrl" role="group" aria-label="Date range">
        {QUICK_RANGES.map(([k, label]) => (
          <button class={view.preset === k ? 'on' : ''} onClick={() => change({ preset: k, step: undefined })}>
            {label}
          </button>
        ))}
        <Menu
          align="end"
          trigger={
            <button class={!quick ? 'on more' : 'more'}>
              <Glyph name="calendar" size={15} />
              {!quick ? rangeName(view.preset, view.from, view.to) : 'More'}
            </button>
          }
        >
          {(close) => (
            <>
              {ALL_RANGES.map(([k, label]) => (
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
                <div class="menu-label">Custom dates</div>
                <input id="range-from" type="date" class="field compact" value={from} onInput={(e) => setFrom(e.currentTarget.value)} />
                <input id="range-to" type="date" class="field compact" value={to} onInput={(e) => setTo(e.currentTarget.value)} />
                <button class="btn primary">Apply</button>
              </form>
            </>
          )}
        </Menu>
      </div>
      <button class="icon-btn" onClick={() => shift(1)} disabled={atPresent} aria-label="Later period">
        <Glyph name="right" size={16} />
      </button>
    </div>
  );
}

function StepControl() {
  const { view, change, summary } = useBoard();
  const active = view.step ?? summary?.period.step ?? 'day';
  return (
    <Menu
      align="end"
      trigger={
        <button class="btn ghost">
          {STEPS.find(([k]) => k === active)?.[1]} <Glyph name="chevron" size={14} />
        </button>
      }
    >
      {(close) =>
        STEPS.map(([k, label]) => (
          <MenuItem
            active={active === k}
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
  );
}

function FilterChips() {
  const { view, change } = useBoard();
  const entries = Object.entries(view.filters);
  if (!entries.length) return null;
  return (
    <div class="chips" aria-label="Active filters">
      <span class="chips-label">
        <Glyph name="filter" size={14} /> Filtered by
      </span>
      {entries.map(([dim, value]) => (
        <span class="chip">
          <span class="chip-dim">{DIMENSION_NAMES[dim] ?? dim}</span>
          <span class="chip-val">
            <SliceLabel by={dim} label={value || null} />
          </span>
          <button
            class="chip-x"
            aria-label={`Remove ${DIMENSION_NAMES[dim] ?? dim} filter`}
            onClick={() => {
              const next = { ...view.filters };
              delete next[dim];
              change({ filters: next });
            }}
          >
            <Glyph name="close" size={12} stroke={2.2} />
          </button>
        </span>
      ))}
      <button class="link-btn" onClick={() => change({ filters: {} })}>
        Clear all
      </button>
    </div>
  );
}

/** Sidebar + top bar around every view of one website. */
export function Shell({ title, subtitle, actions, children, bare }: { title: string; subtitle?: ComponentChildren; actions?: boolean; children: ComponentChildren; bare?: boolean }) {
  const { refresh, summary } = useBoard();
  const [nav, setNav] = useState(false);
  const [palette, setPalette] = useState(false);
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  return (
    <div class="app">
      <Sidebar open={nav} onClose={() => setNav(false)} />
      <main class="main">
        <header class="topbar">
          <button class="icon-btn only-sm" onClick={() => setNav(true)} aria-label="Open menu">
            <Glyph name="menu" />
          </button>
          <button class="jump" onClick={() => setPalette(true)}>
            <Glyph name="search" size={16} />
            <span>Search or jump to…</span>
            <kbd>⌘K</kbd>
          </button>
          {!bare && (
            <div class="top-controls">
              <RangeControl />
              <StepControl />
              <button
                class="icon-btn framed"
                aria-label="Refresh"
                title="Refresh"
                onClick={() => {
                  refresh();
                  setSpin(true);
                  setTimeout(() => setSpin(false), 700);
                }}
              >
                <span class={spin ? 'spin' : ''}>
                  <Glyph name="refresh" size={16} />
                </span>
              </button>
            </div>
          )}
        </header>
        <div class="content">
          <div class="page-head">
            <div>
              <h1>{title}</h1>
              {subtitle && <p class="sub">{subtitle}</p>}
            </div>
            {actions && summary && (
              <span class="live-pill">
                <span class="live" /> {num(summary.online)} online
              </span>
            )}
          </div>
          {!bare && <FilterChips />}
          {children}
        </div>
      </main>
      {palette && <Palette onClose={() => setPalette(false)} />}
    </div>
  );
}
