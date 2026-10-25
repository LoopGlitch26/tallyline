// Line icons for navigation and controls (24px grid, stroke inherits currentColor).
const paths: Record<string, string> = {
  overview: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 8h6V4h-6zM4 20h6v-4H4z',
  acquisition: 'M4 12h11M11 7l5 5-5 5M20 4v16',
  behavior: 'M5 3l13 7-6 1.6L9.5 18z M13 13l5 5',
  revenue: 'M12 3v18M16.5 7.5c-.7-1.4-2.4-2.3-4.5-2.3-2.6 0-4.5 1.3-4.5 3.3 0 4.6 9.5 2.3 9.5 7 0 2-2 3.4-5 3.4-2.3 0-4.2-1-5-2.6',
  people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5M16 3.5a4 4 0 0 1 0 7.5M18.5 14.6c2 .9 3.5 3 3.5 6.4',
  funnels: 'M3 4h18l-7 8.5V19l-4 2v-8.5z',
  setup: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  chevron: 'M6 9l6 6 6-6',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  filter: 'M4 5h16M7 12h10M10 19h4',
  compare: 'M3 17l5-5 4 3 8-8M3 21h18',
  plus: 'M12 5v14M5 12h14',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  check: 'M5 12.5l4.5 4.5L19 7',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
};

export type GlyphName = keyof typeof paths;

export function Glyph({ name, size = 18, stroke = 1.7 }: { name: GlyphName; size?: number; stroke?: number }) {
  return (
    <svg class="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
