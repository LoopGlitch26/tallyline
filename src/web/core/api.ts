export interface Property {
  id: string;
  label: string;
  host: string;
  tz: string;
  currency: string;
  secret_key: string;
  has_dodo_secret: boolean;
  created: number;
  visitors_24h?: number;
  online?: number;
}

export type Step = 'hour' | 'day' | 'week' | 'month';

export interface Totals {
  visitors: number;
  visits: number;
  views: number;
  bounceRate: number;
  avgEngagedMs: number;
  revenue: number;
  payments: number;
  customers: number;
  conversionRate: number;
  revenuePerVisitor: number;
}

export interface Summary {
  period: { start: number; end: number; step: Step };
  currency: string;
  digits: number;
  now: Totals;
  before: Totals;
  online: number;
  series: { key: string; visitors: number; views: number; revenue: number; payments: number }[];
}

export interface Slice {
  label: string | null;
  visitors: number;
  count?: number;
  revenue: number;
  customers: number;
  extra?: string | null;
}

export type Filters = Record<string, string>;

export interface ViewState {
  preset: string;
  from?: string;
  to?: string;
  step?: Step;
  filters: Filters;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function call<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/session')) window.dispatchEvent(new Event('tallyline:signed-out'));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

/** Query string for report endpoints. */
export function reportQuery(v: ViewState, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ preset: v.preset, ...extra });
  if (v.from) q.set('from', v.from);
  if (v.to) q.set('to', v.to);
  if (v.step) q.set('step', v.step);
  if (Object.keys(v.filters).length) q.set('f', JSON.stringify(v.filters));
  return q.toString();
}
