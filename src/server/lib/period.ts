// Turning "last 30 days in Asia/Kolkata" into UTC millisecond bounds and chart buckets.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export type Step = 'hour' | 'day' | 'week' | 'month';
export const STEPS: Step[] = ['hour', 'day', 'week', 'month'];

export const PRESETS = ['today', 'yesterday', 'last24h', 'last48h', 'last7', 'last30', 'last90', 'last365', 'all', 'range'] as const;
export type Preset = (typeof PRESETS)[number];

export interface Period {
  start: number; // inclusive
  end: number; // exclusive
  step: Step;
}

/** How far `tz` is ahead of UTC at instant `at`, in ms. */
export function zoneOffset(tz: string, at = Date.now()): number {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  } catch {
    return 0;
  }
  const f: Record<string, number> = {};
  for (const p of fmt.formatToParts(at)) if (p.type !== 'literal') f[p.type] = Number(p.value);
  const wall = Date.UTC(f.year, f.month - 1, f.day, f.hour % 24, f.minute);
  const floored = at - (at % MIN);
  return Math.round((wall - floored) / MIN) * MIN;
}

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** UTC instant of local midnight for the local day containing `at`. */
export function localMidnight(at: number, tz: string): number {
  const off = zoneOffset(tz, at);
  const local = at + off;
  const midnightLocal = local - (((local % DAY) + DAY) % DAY);
  // Recompute with the offset at midnight itself (DST days).
  return midnightLocal - zoneOffset(tz, midnightLocal - off);
}

/** "YYYY-MM-DD" (a local calendar day) -> UTC instant of its local midnight. */
export function dayStart(ymd: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(asUtc)) return null;
  return asUtc - zoneOffset(tz, asUtc);
}

function daysBack(n: number, now: number, tz: string): number {
  // Midnight n local days before today. Step via the middle of the day to stay clear of DST edges.
  return localMidnight(localMidnight(now, tz) - n * DAY + 12 * HOUR, tz);
}

function autoStep(span: number): Step {
  if (span <= 2 * DAY + HOUR) return 'hour';
  if (span <= 120 * DAY) return 'day';
  if (span <= 400 * DAY) return 'week';
  return 'month';
}

export function resolvePeriod(
  q: { preset?: string | null; from?: string | null; to?: string | null; step?: string | null },
  tz: string,
  propertyCreated: number,
  now = Date.now(),
): Period {
  let start: number;
  let end = now;
  switch ((q.preset ?? 'last30') as Preset) {
    case 'today':
      start = localMidnight(now, tz);
      break;
    case 'yesterday':
      end = localMidnight(now, tz);
      start = daysBack(1, now, tz);
      break;
    case 'last24h':
      start = now - DAY;
      break;
    case 'last48h':
      start = now - 2 * DAY;
      break;
    case 'last7':
      start = daysBack(6, now, tz);
      break;
    case 'last90':
      start = daysBack(89, now, tz);
      break;
    case 'last365':
      start = daysBack(364, now, tz);
      break;
    case 'all':
      start = localMidnight(propertyCreated, tz);
      break;
    case 'range': {
      const a = q.from ? dayStart(q.from, tz) : null;
      const b = q.to ? dayStart(q.to, tz) : null;
      start = a ?? localMidnight(now, tz);
      // `to` names the last day included.
      end = b === null ? now : Math.min(now, localMidnight(b + DAY + 12 * HOUR, tz));
      if (end <= start) end = Math.min(start + DAY, Math.max(now, start + DAY));
      break;
    }
    default:
      start = daysBack(29, now, tz);
  }
  const span = end - start;
  const auto = autoStep(span);
  let step: Step = STEPS.includes(q.step as Step) ? (q.step as Step) : auto;
  if (step === 'hour' && span > 7 * DAY) step = auto; // would be thousands of points
  return { start, end, step };
}

/** The window of equal length right before `p`, for "% vs previous period". */
export function previousPeriod(p: Period): Period {
  const span = p.end - p.start;
  return { start: p.start - span, end: p.start, step: p.step };
}

/**
 * SQL expression giving the bucket key (a string in local time) for a ms timestamp column.
 * Must stay in sync with bucketKeys().
 */
export function bucketExpr(column: string, step: Step, offset: number): string {
  const local = `(${column} + ${Math.trunc(offset)})`;
  switch (step) {
    case 'hour':
      return `strftime('%Y-%m-%dT%H:00', ${local} / 1000, 'unixepoch')`;
    case 'day':
      return `date(${local} / 1000, 'unixepoch')`;
    case 'week':
      // Monday-based weeks. Day 0 of the epoch was a Thursday, so shift by 3 before flooring to 7.
      return `date(((${local} / ${DAY} + 3) / 7 * 7 - 3) * 86400, 'unixepoch')`;
    case 'month':
      return `strftime('%Y-%m', ${local} / 1000, 'unixepoch')`;
  }
}

function keyFor(localMs: number, step: Step): string {
  const iso = new Date(localMs).toISOString();
  switch (step) {
    case 'hour':
      return iso.slice(0, 13) + ':00';
    case 'day':
      return iso.slice(0, 10);
    case 'month':
      return iso.slice(0, 7);
    case 'week': {
      const day = Math.floor(localMs / DAY);
      const monday = (Math.floor((day + 3) / 7) * 7 - 3) * DAY;
      return new Date(monday).toISOString().slice(0, 10);
    }
  }
}

/** Every bucket key from start to end, in order, so the chart has no holes. */
export function bucketKeys(p: Period, offset: number): string[] {
  const out: string[] = [];
  const stride = p.step === 'hour' ? HOUR : DAY;
  let last = '';
  for (let t = p.start; t < p.end; t += stride) {
    const k = keyFor(t + offset, p.step);
    if (k !== last) out.push(k);
    last = k;
  }
  return out;
}
