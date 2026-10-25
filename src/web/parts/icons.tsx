import { iconForSource } from '../../common/sources';
import { flagEmoji } from '../core/format';

/** Inline size for glyph placeholders. Preact 11 needs explicit units. */
const box = (size: number, scale: number) => ({ width: `${size}px`, height: `${size}px`, fontSize: `${size * scale}px` });

export function Favicon({ domain, size = 16 }: { domain?: string | null; size?: number }) {
  if (!domain) return <span class="glyph" style={box(size, 0.7)}>◦</span>;
  return (
    <img
      class="favicon"
      src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
    />
  );
}

export function SourceMark({ source, host, size = 16 }: { source: string | null; host?: string | null; size?: number }) {
  if (!source || source === 'Direct') return <span class="glyph" style={box(size, 0.75)}>↵</span>;
  const domain = iconForSource(source) ?? host ?? (/\./.test(source) ? source : null);
  if (!domain) return <span class="glyph tag" style={box(size, 0.6)}>#</span>;
  return <Favicon domain={domain} size={size} />;
}

const CHANNEL_GLYPHS: Record<string, string> = { Direct: '↵', Search: '⌕', Social: '☍', AI: '✦', Referral: '⇢', Email: '✉', Paid: '$' };
export function ChannelMark({ channel }: { channel: string | null }) {
  return <span class="glyph">{CHANNEL_GLYPHS[channel ?? ''] ?? '•'}</span>;
}

export function Flag({ code, size = 16 }: { code: string | null | undefined; size?: number }) {
  return <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>{flagEmoji(code)}</span>;
}

const DEVICE_GLYPHS: Record<string, string> = { Desktop: '🖥', Mobile: '📱', Tablet: '📟' };
export function DeviceMark({ name }: { name: string | null }) {
  return <span class="glyph">{DEVICE_GLYPHS[name ?? ''] ?? '•'}</span>;
}

const BROWSER_DOMAINS: Record<string, string> = {
  Chrome: 'google.com/chrome',
  Firefox: 'mozilla.org',
  Safari: 'apple.com',
  'Mobile Safari': 'apple.com',
  Edge: 'microsoft.com',
  Opera: 'opera.com',
  Brave: 'brave.com',
  'Samsung Internet': 'samsung.com',
  Vivaldi: 'vivaldi.com',
  Arc: 'arc.net',
  DuckDuckGo: 'duckduckgo.com',
  Yandex: 'yandex.com',
  Instagram: 'instagram.com',
  Facebook: 'facebook.com',
  X: 'x.com',
  LinkedIn: 'linkedin.com',
  TikTok: 'tiktok.com',
  Threads: 'threads.net',
};
export function BrowserMark({ name }: { name: string | null }) {
  const d = BROWSER_DOMAINS[name ?? ''];
  return d ? <Favicon domain={d.split('/')[0]} /> : <span class="glyph">◎</span>;
}

const OS_GLYPHS: Record<string, string> = { macOS: '⌘', iOS: '⌘', iPadOS: '⌘', Windows: '⊞', Android: '🤖', Linux: '🐧', ChromeOS: '◉' };
export function OsMark({ name }: { name: string | null }) {
  return <span class="glyph">{OS_GLYPHS[name ?? ''] ?? '•'}</span>;
}

/** Deterministic two-tone avatar for anonymous visitors. */
export function Avatar({ seed, size = 40 }: { seed: string; size?: number }) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >>> 9) % 120)) % 360;
  const cells: preact.JSX.Element[] = [];
  // 5x5 mirrored pattern.
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++) {
      if ((h >>> (y * 3 + x)) & 1) {
        cells.push(<rect x={x} y={y} width="1" height="1" />);
        if (x < 2) cells.push(<rect x={4 - x} y={y} width="1" height="1" />);
      }
    }
  return (
    <svg width={size} height={size} viewBox="-1 -1 7 7" class="avatar" style={{ background: `hsl(${hue1} 70% 92%)` }} aria-hidden="true">
      <g fill={`hsl(${hue2} 55% 45%)`}>{cells}</g>
    </svg>
  );
}
