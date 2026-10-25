import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { call, reportQuery, type Slice } from '../core/api';
import { DIMENSION_NAMES, SECTIONS, useBoard } from '../core/board';
import { go } from '../core/nav';
import { Glyph, type GlyphName } from './glyphs';
import { ALL_RANGES } from '../core/ranges';

interface Command {
  group: string;
  label: string;
  hint?: string;
  icon: GlyphName;
  run: () => void;
}

/** ⌘K: jump to any view, change the date range, switch website or filter by a top value. */
export function Palette({ onClose }: { onClose: () => void }) {
  const b = useBoard();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [tops, setTops] = useState<Record<string, Slice[]>>({});
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    input.current?.focus();
    // Offer the most common values as one-step filters.
    for (const by of ['source', 'campaign', 'country', 'page', 'goal']) {
      call<Slice[]>(`/api/properties/${b.property.id}/breakdown?${reportQuery({ ...b.view, filters: {} }, { by, limit: '6' })}`)
        .then((rows) => setTops((t) => ({ ...t, [by]: rows.filter((r) => r.label).slice(0, 6) })))
        .catch(() => {});
    }
  }, []);

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = [];
    for (const s of SECTIONS) out.push({ group: 'Go to', label: s.label, hint: s.hint, icon: s.key as GlyphName, run: () => b.goSection(s.key) });
    for (const [k, label] of ALL_RANGES) out.push({ group: 'Date range', label, icon: 'calendar', run: () => b.change({ preset: k, step: undefined }) });
    out.push({ group: 'Actions', label: b.compare ? 'Hide previous-period comparison' : 'Compare with previous period', icon: 'compare', run: () => b.setCompare(!b.compare) });
    if (Object.keys(b.view.filters).length) out.push({ group: 'Actions', label: 'Clear all filters', icon: 'filter', run: () => b.change({ filters: {} }) });
    out.push({ group: 'Actions', label: 'Refresh data', icon: 'refresh', run: b.refresh });
    for (const [by, rows] of Object.entries(tops))
      for (const r of rows) out.push({ group: 'Filter by', label: `${DIMENSION_NAMES[by]}: ${r.label}`, icon: 'filter', run: () => b.addFilter(by, r.label ?? '') });
    for (const p of b.properties) if (p.id !== b.property.id) out.push({ group: 'Websites', label: p.label, hint: p.host, icon: 'globe', run: () => go(`/p/${p.id}/${b.section}${location.search}`) });
    return out;
  }, [b, tops]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = commands.filter((c) => words.every((w) => `${c.group} ${c.label} ${c.hint ?? ''}`.toLowerCase().includes(w))).slice(0, 40);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (c?: Command) => {
    if (!c) return;
    onClose();
    c.run();
  };

  let lastGroup = '';
  return (
    <div class="scrim palette-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="palette" role="dialog" aria-modal="true" aria-label="Search and jump">
        <label class="palette-input">
          <Glyph name="search" />
          <input
            ref={input}
            id="palette-q"
            value={q}
            placeholder="Type a view, a date range or a source…"
            onInput={(e) => setQ(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(shown.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') run(shown[sel]);
              else if (e.key === 'Escape') onClose();
            }}
          />
          <kbd>esc</kbd>
        </label>
        <ul class="palette-list" ref={list}>
          {shown.length === 0 && <li class="palette-empty">No matches. Try "pricing", "7 days" or a source name.</li>}
          {shown.map((c, i) => {
            const header = c.group !== lastGroup ? (lastGroup = c.group) : null;
            return (
              <>
                {header && <li class="palette-group">{header}</li>}
                <li>
                  <button class={`palette-item${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
                    <Glyph name={c.icon} size={16} />
                    <span class="ellipsis">{c.label}</span>
                    {c.hint && <small class="ellipsis">{c.hint}</small>}
                    <Glyph name="arrow" size={14} />
                  </button>
                </li>
              </>
            );
          })}
        </ul>
        <footer class="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
        </footer>
      </div>
    </div>
  );
}
