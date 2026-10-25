import { resolvePeriod, zoneOffset, type Period } from '../lib/period';
import type { Property } from '../types';
import { filterClause, parseFilters, type Filters } from './dimensions';

/** Everything a report needs: which property, which time window, which filters. */
export class Scope {
  readonly offset: number;
  readonly filtered: boolean;

  constructor(
    readonly db: D1Database,
    readonly property: Property,
    readonly period: Period,
    readonly filters: Filters,
  ) {
    this.offset = zoneOffset(property.tz, period.end);
    this.filtered = Object.keys(filters).length > 0;
  }

  static fromQuery(db: D1Database, property: Property, q: URLSearchParams, now = Date.now()): Scope {
    const period = resolvePeriod({ preset: q.get('preset'), from: q.get('from'), to: q.get('to'), step: q.get('step') }, property.tz, property.created, now);
    return new Scope(db, property, period, parseFilters(q.get('f')));
  }

  /** Visits `v` that started in [start, end) and match the filters. */
  visits(start = this.period.start, end = this.period.end): { sql: string; args: unknown[] } {
    const f = filterClause(this.filters);
    return { sql: `v.property_id = ? AND v.began >= ? AND v.began < ?${f.sql}`, args: [this.property.id, start, end, ...f.args] };
  }

  /**
   * "FROM ..." for charges `c` in [start, end). With filters (or when the caller needs visit columns)
   * the charge is joined to the visit credited with it.
   */
  charges(start = this.period.start, end = this.period.end, needVisit = false): { sql: string; args: unknown[] } {
    if (!this.filtered && !needVisit) {
      return { sql: `charges c WHERE c.property_id = ? AND c.at >= ? AND c.at < ?`, args: [this.property.id, start, end] };
    }
    const f = filterClause(this.filters);
    return {
      sql: `charges c JOIN visits v ON v.property_id = c.property_id AND v.vsn = c.vsn
            WHERE c.property_id = ? AND c.at >= ? AND c.at < ?${f.sql}`,
      args: [this.property.id, start, end, ...f.args],
    };
  }

  /** "FROM hits h [JOIN visits v] WHERE ..." for hits of one kind in the period. */
  hits(kind: string): { sql: string; args: unknown[] } {
    const f = filterClause(this.filters);
    const join = this.filtered ? 'JOIN visits v ON v.property_id = h.property_id AND v.vsn = h.vsn' : '';
    return {
      sql: `hits h ${join} WHERE h.property_id = ? AND h.kind = ? AND h.at >= ? AND h.at < ?${f.sql}`,
      args: [this.property.id, kind, this.period.start, this.period.end, ...f.args],
    };
  }
}
