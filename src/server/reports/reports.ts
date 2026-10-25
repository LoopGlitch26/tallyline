import { bucketExpr, bucketKeys, previousPeriod } from '../lib/period';
import { minorDigits, type Property } from '../types';
import { DIMENSIONS, filterClause } from './dimensions';
import type { Scope } from './scope';

type Row = Record<string, any>;

// ---------------------------------------------------------------- summary (KPIs + chart)

interface Totals {
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

function totals(s: Scope, start: number, end: number): [D1PreparedStatement, D1PreparedStatement] {
  const v = s.visits(start, end);
  const c = s.charges(start, end);
  return [
    s.db
      .prepare(
        `SELECT COUNT(DISTINCT v.uid) AS visitors, COUNT(*) AS visits, COALESCE(SUM(v.views), 0) AS views,
                COALESCE(SUM(v.views <= 1 AND v.conversions = 0), 0) AS bounces, COALESCE(AVG(v.engaged_ms), 0) AS engaged
         FROM visits v WHERE ${v.sql}`,
      )
      .bind(...v.args),
    s.db
      .prepare(
        `SELECT COALESCE(SUM(c.amount_minor), 0) AS revenue,
                COALESCE(SUM(c.kind = 'charge'), 0) AS payments,
                COUNT(DISTINCT CASE WHEN c.kind = 'charge' AND c.recurring = 0 THEN COALESCE(c.uid, c.id) END) AS customers
         FROM ${c.sql}`,
      )
      .bind(...c.args),
  ];
}

function shapeTotals(t: Row, m: Row): Totals {
  return {
    visitors: t.visitors,
    visits: t.visits,
    views: t.views,
    bounceRate: t.visits ? t.bounces / t.visits : 0,
    avgEngagedMs: Math.round(t.engaged),
    revenue: m.revenue,
    payments: m.payments,
    customers: m.customers,
    conversionRate: t.visitors ? m.customers / t.visitors : 0,
    revenuePerVisitor: t.visitors ? m.revenue / t.visitors : 0,
  };
}

export async function summary(s: Scope) {
  const { db, period, property } = s;
  const prev = previousPeriod(period);
  const now = Date.now();
  const v = s.visits();
  const c = s.charges();
  const vb = bucketExpr('v.began', period.step, s.offset);
  const cb = bucketExpr('c.at', period.step, s.offset);

  const [curT, curM] = totals(s, period.start, period.end);
  const [prevT, prevM] = totals(s, prev.start, prev.end);
  const res = await db.batch([
    curT,
    curM,
    prevT,
    prevM,
    db
      .prepare('SELECT COUNT(DISTINCT uid) AS n FROM visits WHERE property_id = ?1 AND began > ?2 AND last_active > ?3')
      .bind(property.id, now - 6 * 3_600_000, now - 5 * 60_000),
    db.prepare(`SELECT ${vb} AS k, COUNT(DISTINCT v.uid) AS visitors, SUM(v.views) AS views FROM visits v WHERE ${v.sql} GROUP BY k`).bind(...v.args),
    db.prepare(`SELECT ${cb} AS k, SUM(c.amount_minor) AS revenue, SUM(c.kind = 'charge') AS payments FROM ${c.sql} GROUP BY k`).bind(...c.args),
  ]);
  const [t1, m1, t0, m0, online, vs, cs] = res.map((r) => r.results as Row[]);

  const vByKey = new Map(vs.map((r) => [r.k, r]));
  const cByKey = new Map(cs.map((r) => [r.k, r]));
  const series = bucketKeys(period, s.offset).map((k) => ({
    key: k,
    visitors: vByKey.get(k)?.visitors ?? 0,
    views: vByKey.get(k)?.views ?? 0,
    revenue: cByKey.get(k)?.revenue ?? 0,
    payments: cByKey.get(k)?.payments ?? 0,
  }));

  return {
    period,
    currency: property.currency,
    digits: minorDigits(property.currency),
    now: shapeTotals(t1[0], m1[0]),
    before: shapeTotals(t0[0], m0[0]),
    online: online[0]?.n ?? 0,
    series,
  };
}

// ---------------------------------------------------------------- breakdowns

export interface Slice {
  label: string | null;
  visitors: number;
  count?: number;
  revenue: number;
  customers: number;
  extra?: string | null;
}

export async function breakdown(s: Scope, key: string, limit = 100): Promise<Slice[]> {
  const dim = DIMENSIONS[key];
  if (!dim) throw new Error(`Unknown dimension "${key}"`);
  const lim = Math.min(500, Math.max(1, Math.floor(limit)));
  const { db, property, period } = s;

  if (dim.kind === 'visit') {
    const v = s.visits();
    const c = s.charges(undefined, undefined, true);
    const [traffic, money] = await db.batch([
      db
        .prepare(
          `SELECT ${dim.column} AS label, COUNT(DISTINCT v.uid) AS visitors, SUM(v.views) AS count, ${dim.extra ?? 'NULL'} AS extra
           FROM visits v WHERE ${v.sql} GROUP BY 1 ORDER BY visitors DESC LIMIT ${lim}`,
        )
        .bind(...v.args),
      db
        .prepare(
          `SELECT ${dim.column} AS label, SUM(c.amount_minor) AS revenue,
                  COUNT(DISTINCT CASE WHEN c.kind = 'charge' THEN COALESCE(c.uid, c.id) END) AS customers
           FROM ${c.sql} GROUP BY 1`,
        )
        .bind(...c.args),
    ]);
    return combine(traffic.results as Row[], money.results as Row[]);
  }

  // Hit-based: pages viewed, goals completed, outbound links clicked.
  const kind = dim.kind === 'page' ? 'view' : dim.kind === 'goal' ? 'conversion' : 'exit';
  const field = dim.kind === 'page' ? 'h.path' : 'h.label';
  const h = s.hits(kind);
  const [traffic, money] = await db.batch([
    db
      .prepare(`SELECT ${field} AS label, COUNT(DISTINCT h.uid) AS visitors, COUNT(*) AS count FROM ${h.sql} GROUP BY 1 ORDER BY visitors DESC LIMIT ${lim}`)
      .bind(...h.args),
    // Revenue from buyers who viewed / completed / clicked it during the period.
    db
      .prepare(
        `SELECT x.label AS label, SUM(c.amount_minor) AS revenue, COUNT(DISTINCT CASE WHEN c.kind = 'charge' THEN c.uid END) AS customers
         FROM (SELECT DISTINCT ${field} AS label, h.uid AS uid FROM ${h.sql}) x
         JOIN charges c ON c.property_id = ? AND c.uid = x.uid AND c.at >= ? AND c.at < ?
         GROUP BY x.label`,
      )
      .bind(...h.args, property.id, period.start, period.end),
  ]);
  return combine(traffic.results as Row[], money.results as Row[]);
}

function combine(traffic: Row[], money: Row[]): Slice[] {
  const byLabel = new Map(money.map((m) => [m.label, m]));
  const out: Slice[] = traffic.map((t) => ({
    label: t.label,
    visitors: t.visitors,
    count: t.count ?? undefined,
    revenue: byLabel.get(t.label)?.revenue ?? 0,
    customers: byLabel.get(t.label)?.customers ?? 0,
    extra: t.extra ?? null,
  }));
  // A source can earn money in a period where it sent no visits (they paid later): still list it.
  const listed = new Set(traffic.map((t) => t.label));
  for (const m of money) if (!listed.has(m.label)) out.push({ label: m.label, visitors: 0, revenue: m.revenue, customers: m.customers });
  return out;
}

// ---------------------------------------------------------------- customers ("Revenue journey")

export async function buyers(s: Scope) {
  const { db, property, period } = s;
  // With filters, keep only charges credited to a visit that matches them.
  const f = filterClause(s.filters);
  const res = await db
    .prepare(
      `SELECT c.id, c.at, c.amount_minor, c.currency, c.recurring, c.linked_via, c.uid, c.vsn,
              c.email AS charge_email, c.display_name AS charge_name,
              pe.first_at, pe.display_name, pe.email, pe.ext_id,
              v.source, v.channel, v.ref_host, v.utm_campaign, v.tag, v.country, v.city, v.device, v.os, v.browser, v.landing,
              (SELECT COUNT(*) FROM visits v2 WHERE v2.property_id = c.property_id AND v2.uid = c.uid AND v2.began <= c.at) AS visit_count
       FROM charges c
       LEFT JOIN people pe ON pe.property_id = c.property_id AND pe.uid = c.uid
       ${s.filtered ? 'JOIN' : 'LEFT JOIN'} visits v ON v.property_id = c.property_id AND v.vsn = c.vsn
       WHERE c.property_id = ? AND c.kind = 'charge' AND c.at >= ? AND c.at < ?${f.sql}
       ORDER BY c.at DESC LIMIT 200`,
    )
    .bind(property.id, period.start, period.end, ...f.args)
    .all();
  return res.results;
}

// ---------------------------------------------------------------- people

export async function people(s: Scope) {
  const v = s.visits();
  // Bare columns next to MAX() come from the row holding the max in SQLite, i.e. the latest visit.
  const res = await s.db
    .prepare(
      `SELECT g.*, pe.display_name, pe.email, pe.ext_id, pe.first_at,
              (SELECT COALESCE(SUM(amount_minor), 0) FROM charges c WHERE c.property_id = g.property_id AND c.uid = g.uid) AS spent
       FROM (
         SELECT v.property_id, v.uid, MAX(v.last_active) AS last_active, COUNT(*) AS visits, SUM(v.views) AS views,
                SUM(v.engaged_ms) AS engaged_ms, v.source, v.ref_host, v.country, v.city, v.device, v.os, v.browser
         FROM visits v WHERE ${v.sql} GROUP BY v.uid ORDER BY last_active DESC LIMIT 200
       ) g
       LEFT JOIN people pe ON pe.property_id = g.property_id AND pe.uid = g.uid
       ORDER BY g.last_active DESC`,
    )
    .bind(...v.args)
    .all();
  return res.results;
}

export async function personProfile(db: D1Database, p: Property, uid: string) {
  const [person, visits, hits, charges] = await db.batch([
    db.prepare('SELECT * FROM people WHERE property_id = ?1 AND uid = ?2').bind(p.id, uid),
    db.prepare('SELECT * FROM visits WHERE property_id = ?1 AND uid = ?2 ORDER BY began DESC LIMIT 100').bind(p.id, uid),
    db.prepare('SELECT vsn, at, kind, label, path, meta FROM hits WHERE property_id = ?1 AND uid = ?2 ORDER BY at DESC LIMIT 1000').bind(p.id, uid),
    db.prepare('SELECT * FROM charges WHERE property_id = ?1 AND uid = ?2 ORDER BY at DESC').bind(p.id, uid),
  ]);
  return {
    person: person.results[0] ?? null,
    visits: visits.results,
    hits: hits.results,
    charges: charges.results,
    currency: p.currency,
    digits: minorDigits(p.currency),
  };
}

// ---------------------------------------------------------------- funnels

export interface FunnelStep {
  kind: 'page' | 'goal';
  /** A goal name, or a page path where * matches anything (e.g. /blog/*). */
  match: string;
}

export function cleanSteps(input: unknown): FunnelStep[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((x) => x && (x.kind === 'page' || x.kind === 'goal') && typeof x.match === 'string' && x.match.trim())
    .slice(0, 10)
    .map((x) => ({ kind: x.kind, match: x.match.trim().slice(0, 200) }));
}

export function stepMatcher(step: FunnelStep): (h: { kind: string; label: string | null; path: string | null }) => boolean {
  if (step.kind === 'goal') return (h) => h.kind === 'conversion' && h.label === step.match;
  const pattern = new RegExp('^' + step.match.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return (h) => h.kind === 'view' && pattern.test(h.path ?? '');
}

/** How many people reached each step, in order, during the period. */
export async function funnelReport(s: Scope, steps: FunnelStep[]) {
  if (!steps.length) return [];
  const ors: string[] = [];
  const stepArgs: unknown[] = [];
  for (const st of steps) {
    if (st.kind === 'goal') {
      ors.push(`(h.kind = 'conversion' AND h.label = ?)`);
      stepArgs.push(st.match);
    } else {
      ors.push(`(h.kind = 'view' AND h.path GLOB ?)`);
      stepArgs.push(st.match);
    }
  }
  const f = filterClause(s.filters);
  const join = s.filtered ? 'JOIN visits v ON v.property_id = h.property_id AND v.vsn = h.vsn' : '';
  const rows = (
    await s.db
      .prepare(
        `SELECT h.uid AS uid, h.at AS at, h.kind AS kind, h.label AS label, h.path AS path
         FROM hits h ${join}
         WHERE h.property_id = ? AND h.at >= ? AND h.at < ? AND (${ors.join(' OR ')})${f.sql}
         ORDER BY h.at LIMIT 100000`,
      )
      .bind(s.property.id, s.period.start, s.period.end, ...stepArgs, ...f.args)
      .all<{ uid: string; at: number; kind: string; label: string | null; path: string | null }>()
  ).results;

  const matchers = steps.map(stepMatcher);
  const reached = new Map<string, number>();
  for (const r of rows) {
    const at = reached.get(r.uid) ?? 0;
    if (at < steps.length && matchers[at](r)) reached.set(r.uid, at + 1);
  }
  const counts = steps.map(() => 0);
  for (const n of reached.values()) for (let i = 0; i < n; i++) counts[i]++;
  return steps.map((st, i) => ({ ...st, people: counts[i] }));
}
