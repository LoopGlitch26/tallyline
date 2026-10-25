const intl = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat('en', o);

export function num(n: number): string {
  if (Math.abs(n) >= 10_000) return intl({ notation: 'compact', maximumFractionDigits: 1 }).format(n);
  return intl({ maximumFractionDigits: 0 }).format(n);
}

/** Money from minor units. `short` uses compact notation for big numbers. */
export function money(minor: number, currency: string, digits: number, short = false): string {
  const major = minor / 10 ** digits;
  const abs = Math.abs(major);
  try {
    return intl({
      style: 'currency',
      currency,
      notation: short && abs >= 10_000 ? 'compact' : 'standard',
      minimumFractionDigits: 0,
      maximumFractionDigits: short || abs >= 1000 ? 0 : abs > 0 && abs < 10 ? 2 : 0,
    }).format(major);
  } catch {
    return `${major.toFixed(digits)} ${currency}`;
  }
}

export function pct(ratio: number, decimals?: number): string {
  const v = ratio * 100;
  const d = decimals ?? (v > 0 && v < 1 ? 2 : v < 10 ? 1 : 0);
  return `${v.toFixed(d)}%`;
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

/** "3 hours", "2 days" — for "time to convert" and "last seen ... ago". */
export function span(ms: number): string {
  const units: [number, string][] = [
    [30 * 86_400_000, 'month'],
    [86_400_000, 'day'],
    [3_600_000, 'hour'],
    [60_000, 'minute'],
  ];
  for (const [size, name] of units) {
    const n = Math.round(ms / size);
    if (n >= 1 && ms >= size * 0.95) return `${n} ${name}${n === 1 ? '' : 's'}`;
  }
  return 'seconds';
}

export function stamp(ts: number, tz: string): string {
  return new Intl.DateTimeFormat('en', { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ts);
}

export function clock(ts: number, tz: string): string {
  return new Intl.DateTimeFormat('en', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(ts);
}

/** YYYY-MM-DD of an instant in the property's zone. */
export function ymd(ts: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);
}

/** Axis / tooltip text for a chart bucket key. */
export function bucketText(key: string, step: string, full = false): string {
  const utc = { timeZone: 'UTC' } as const;
  if (step === 'hour') {
    const d = new Date(key + ':00Z');
    const t = d.toLocaleTimeString('en', { hour: 'numeric', ...utc });
    return full ? `${d.toLocaleDateString('en', { month: 'short', day: 'numeric', ...utc })}, ${t}` : t;
  }
  if (step === 'month') return new Date(key + '-01T00:00:00Z').toLocaleDateString('en', { month: 'short', year: full ? 'numeric' : '2-digit', ...utc });
  const d = new Date(key + 'T00:00:00Z');
  if (step === 'week') return (full ? 'Week of ' : '') + d.toLocaleDateString('en', { month: 'short', day: 'numeric', ...utc });
  return d.toLocaleDateString('en', full ? { weekday: 'short', month: 'short', day: 'numeric', ...utc } : { month: 'short', day: 'numeric', ...utc });
}

let regionNames: Intl.DisplayNames | null = null;
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  regionNames = null;
}

export function country(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function flagEmoji(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code) || code === 'XX' || code === 'T1') return '🌐';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)));
}

/** Short readable handle for an anonymous visitor. */
export function nickname(uid: string): string {
  const adjectives = ['amber', 'brisk', 'calm', 'dusty', 'eager', 'fern', 'glad', 'hazel', 'ivory', 'jade', 'keen', 'lunar', 'misty', 'noble', 'olive', 'plum'];
  const nouns = ['otter', 'heron', 'lynx', 'finch', 'koala', 'marten', 'quail', 'robin', 'tapir', 'wren', 'bison', 'gecko', 'ibis', 'moth', 'newt', 'stoat'];
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return `${adjectives[h % 16]} ${nouns[(h >>> 4) % 16]}`;
}
