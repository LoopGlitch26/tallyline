import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useCopy } from '../core/hooks';

/** Button that opens a floating panel; clicking outside closes it. */
export function Menu({ trigger, children, align = 'start' }: { trigger: ComponentChildren; children: (close: () => void) => ComponentChildren; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div class="menu" ref={box}>
      <div class="menu-trigger" onClick={() => setOpen((o) => !o)}>
        {trigger}
      </div>
      {open && <div class={`menu-panel ${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function MenuItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ComponentChildren }) {
  return (
    <button class={`menu-item${active ? ' on' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
}

export function Dialog({ open, onClose, title, wide, children }: { open: boolean; onClose: () => void; title: ComponentChildren; wide?: boolean; children: ComponentChildren }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <header>
          <h3>{title}</h3>
          <button class="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div class="dialog-body">{children}</div>
      </div>
    </div>
  );
}

/** Panel that slides in from the right. */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ComponentChildren; children: ComponentChildren }) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="drawer" role="dialog" aria-modal="true">
        <header>
          <h3>{title}</h3>
          <button class="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div class="drawer-body">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="tabs" role="tablist">
      {options.map((o) => (
        <button role="tab" aria-selected={o.value === value} class={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CodeBlock({ code }: { code: string }) {
  const [done, copy] = useCopy();
  return (
    <div class="code">
      <pre>{code}</pre>
      <button class="copy" onClick={() => copy(code)}>
        {done ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <div class="empty">{children}</div>;
}

export function Skeleton({ height = 160 }: { height?: number }) {
  return <div class="skeleton" style={{ height: `${height}px` }} />;
}

export function Delta({ now, before, lowerIsBetter }: { now: number; before: number; lowerIsBetter?: boolean }) {
  if (!before) return <span class="delta flat">—</span>;
  const change = (now - before) / before;
  if (!Number.isFinite(change)) return null;
  const up = change >= 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span class={`delta ${good ? 'good' : 'bad'}`}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(change * 100))}%
    </span>
  );
}
