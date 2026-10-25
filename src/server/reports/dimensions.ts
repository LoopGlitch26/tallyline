// Every way the dashboard can slice traffic. The same key is used to break data down and to filter by it.

export type DimensionKind = 'visit' | 'page' | 'goal' | 'outbound';

export interface Dimension {
  kind: DimensionKind;
  /** Column on visits (alias v) for kind 'visit'. */
  column?: string;
  /** Extra column shown next to the label (e.g. the country for a city). */
  extra?: string;
  /** Can a row be clicked to filter the dashboard? */
  filterable: boolean;
}

export const DIMENSIONS: Record<string, Dimension> = {
  channel: { kind: 'visit', column: 'v.channel', filterable: true },
  source: { kind: 'visit', column: 'v.source', extra: 'MAX(v.ref_host)', filterable: true },
  referrer: { kind: 'visit', column: 'v.ref_url', filterable: true },
  campaign: { kind: 'visit', column: 'v.utm_campaign', filterable: true },
  keyword: { kind: 'visit', column: 'v.utm_term', filterable: true },
  utm_source: { kind: 'visit', column: 'v.utm_source', filterable: true },
  utm_medium: { kind: 'visit', column: 'v.utm_medium', filterable: true },
  utm_content: { kind: 'visit', column: 'v.utm_content', filterable: true },
  tag: { kind: 'visit', column: 'v.tag', filterable: true },
  country: { kind: 'visit', column: 'v.country', filterable: true },
  region: { kind: 'visit', column: 'v.region', extra: 'MAX(v.country)', filterable: true },
  city: { kind: 'visit', column: 'v.city', extra: 'MAX(v.country)', filterable: true },
  browser: { kind: 'visit', column: 'v.browser', filterable: true },
  os: { kind: 'visit', column: 'v.os', filterable: true },
  device: { kind: 'visit', column: 'v.device', filterable: true },
  landing: { kind: 'visit', column: 'v.landing', filterable: true },
  exit_page: { kind: 'visit', column: 'v.last_path', filterable: true },
  host_name: { kind: 'visit', column: 'v.host_name', filterable: true },
  page: { kind: 'page', filterable: true },
  goal: { kind: 'goal', filterable: true },
  outbound: { kind: 'outbound', filterable: false },
};

export type Filters = Record<string, string>;

/** Parse the dashboard's `f` query param (JSON object of dimension -> value). Unknown keys are dropped. */
export function parseFilters(raw: string | null): Filters {
  if (!raw) return {};
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return {};
  }
  const out: Filters = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (DIMENSIONS[k]?.filterable && typeof v === 'string') out[k] = v.slice(0, 500);
  }
  return out;
}

/** WHERE fragment (starting with " AND ") restricting visits `v` to the filters. Uses anonymous ? params. */
export function filterClause(filters: Filters): { sql: string; args: unknown[] } {
  const parts: string[] = [];
  const args: unknown[] = [];
  for (const [key, value] of Object.entries(filters)) {
    const d = DIMENSIONS[key];
    if (!d) continue;
    if (d.kind === 'visit') {
      if (value === '') parts.push(`${d.column} IS NULL`);
      else {
        parts.push(`${d.column} = ?`);
        args.push(value);
      }
    } else if (d.kind === 'page' || d.kind === 'goal') {
      const hitKind = d.kind === 'page' ? 'view' : 'conversion';
      const field = d.kind === 'page' ? 'path' : 'label';
      parts.push(`EXISTS (SELECT 1 FROM hits fh WHERE fh.property_id = v.property_id AND fh.vsn = v.vsn AND fh.kind = '${hitKind}' AND fh.${field} = ?)`);
      args.push(value);
    }
  }
  return { sql: parts.length ? ' AND ' + parts.join(' AND ') : '', args };
}
