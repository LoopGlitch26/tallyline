import type { Property } from '../types';
import { CREDITED_VISIT_SQL, CREDIT_GRACE_MS } from './credit';

export type LinkedVia = 'metadata' | 'return_visit' | 'prior_charge' | 'email' | 'timing';

export interface ChargeIn {
  id: string;
  gateway: 'dodo' | 'api';
  at: number;
  amountMinor: number; // negative for refunds
  kind: 'charge' | 'refund';
  currency: string;
  uid?: string | null;
  vsn?: string | null;
  customerRef?: string | null;
  email?: string | null;
  name?: string | null;
  subscriptionRef?: string | null;
  recurring?: boolean;
}

export interface Link {
  uid: string | null;
  vsn: string | null;
  via: LinkedVia | null;
  recurring: boolean;
  /** Human explanation, mostly for why timing did or didn't pick someone. */
  note: string | null;
}

const MINUTE = 60_000;
const TIMING_LOOKBACK = 3 * 60 * MINUTE;

/**
 * Figure out which browser paid, trying the most trustworthy evidence first:
 *   1. metadata      tl_uid passed into the checkout
 *   2. return_visit  the browser landed on the return URL carrying this payment's id
 *   3. prior_charge  the same customer (id or email) paid before: renewal / repeat purchase
 *   4. email         email matches someone identify()'d on the site
 *   5. timing        exactly one browser clicked checkout shortly before the payment
 */
export async function linkCharge(db: D1Database, p: Property, c: ChargeIn): Promise<Link> {
  let uid = c.uid ?? null;
  let via: LinkedVia | null = uid ? 'metadata' : null;
  let recurring = !!c.recurring;
  let note: string | null = null;

  if (!uid) {
    const ret = await db
      .prepare('SELECT uid FROM checkout_returns WHERE property_id = ?1 AND charge_ref IN (?2, ?3) ORDER BY at LIMIT 1')
      .bind(p.id, c.id, c.subscriptionRef ?? c.id)
      .first<{ uid: string }>();
    if (ret) [uid, via] = [ret.uid, 'return_visit'];
  }

  if (c.customerRef || c.email) {
    const earlier = await db
      .prepare(
        `SELECT uid FROM charges
         WHERE property_id = ?1 AND kind = 'charge' AND uid IS NOT NULL AND id != ?2
           AND ((?3 IS NOT NULL AND customer_ref = ?3) OR (?4 IS NOT NULL AND email = ?4))
         ORDER BY at LIMIT 1`,
      )
      .bind(p.id, c.id, c.customerRef ?? null, c.email ?? null)
      .first<{ uid: string }>();
    if (earlier) {
      if (!uid) [uid, via] = [earlier.uid, 'prior_charge'];
      if (c.kind === 'charge') recurring = true;
    }
  }

  if (!uid && c.email) {
    const person = await db
      .prepare('SELECT uid FROM people WHERE property_id = ?1 AND email = ?2 ORDER BY first_at DESC LIMIT 1')
      .bind(p.id, c.email)
      .first<{ uid: string }>();
    if (person) [uid, via] = [person.uid, 'email'];
  }

  if (!uid && c.kind === 'charge' && !recurring) {
    const t = await linkByTiming(db, p, c);
    note = t.note;
    if (t.uid) [uid, via] = [t.uid, 'timing'];
  }

  let vsn: string | null = null;
  if (uid) {
    const v = await db.prepare(CREDITED_VISIT_SQL).bind(p.id, uid, c.at + CREDIT_GRACE_MS).first<{ vsn: string }>();
    vsn = v?.vsn ?? c.vsn ?? null;
  }
  return { uid, vsn, via, recurring, note };
}

/**
 * Last resort. Look at who clicked a Dodo checkout link (or fired a checkout/buy/purchase goal)
 * in the 3 hours before the payment. Only answer when the evidence points at one person:
 *   a) only one clicker, or
 *   b) only one clicker came back to the site after their click and right after the payment
 *      (Dodo redirects buyers home; people who abandon checkout usually don't come back), or
 *   c) only one clicker in the final 30 minutes.
 */
export async function linkByTiming(db: D1Database, p: Property, c: ChargeIn): Promise<{ uid: string | null; note: string }> {
  const clickers = (
    await db
      .prepare(
        `SELECT h.uid AS uid, MAX(h.at) AS clicked FROM hits h
         WHERE h.property_id = ?1 AND h.at BETWEEN ?2 AND ?3
           AND (
             (h.kind = 'exit' AND h.label LIKE '%dodopayments.com%')
             OR (h.kind = 'conversion' AND (h.label LIKE '%checkout%' OR h.label LIKE '%buy%' OR h.label LIKE '%purchase%'))
           )
           AND NOT EXISTS (
             SELECT 1 FROM charges o WHERE o.property_id = h.property_id AND o.uid = h.uid AND o.kind = 'charge'
               AND o.id != ?4 AND o.at BETWEEN ?2 AND ?5
           )
         GROUP BY h.uid ORDER BY clicked DESC LIMIT 50`,
      )
      .bind(p.id, c.at - TIMING_LOOKBACK, c.at + 2 * MINUTE, c.id, c.at + TIMING_LOOKBACK)
      .all<{ uid: string; clicked: number }>()
  ).results;

  if (clickers.length === 0) return { uid: null, note: 'Nobody clicked a checkout link in the 3 hours before this payment (was the tracker installed then?)' };
  if (clickers.length === 1) return { uid: clickers[0].uid, note: 'Only one checkout click before the payment' };

  const lastClick = new Map(clickers.map((x) => [x.uid, x.clicked]));
  const marks = clickers.map((_, i) => `?${i + 4}`).join(', ');
  const views = (
    await db
      .prepare(
        `SELECT uid, at FROM hits WHERE property_id = ?1 AND kind = 'view' AND at BETWEEN ?2 AND ?3 AND uid IN (${marks}) LIMIT 1000`,
      )
      .bind(p.id, c.at - MINUTE, c.at + 30 * MINUTE, ...clickers.map((x) => x.uid))
      .all<{ uid: string; at: number }>()
  ).results;
  const cameBack = new Set(views.filter((v) => v.at > (lastClick.get(v.uid) ?? Infinity)).map((v) => v.uid));
  if (cameBack.size === 1) return { uid: [...cameBack][0], note: 'Returned to the site right after paying' };

  const lastHalfHour = clickers.filter((x) => x.clicked >= c.at - 30 * MINUTE && x.clicked <= c.at + MINUTE);
  if (lastHalfHour.length === 1) return { uid: lastHalfHour[0].uid, note: 'Only checkout click in the 30 minutes before the payment' };

  const extra = cameBack.size > 1 ? `, and ${cameBack.size} of them came back right after` : '';
  return { uid: null, note: `${clickers.length} people clicked checkout before this payment${extra} — too close to call` };
}

/** Store a charge (idempotent on id) and enrich the buyer's profile. */
export async function saveCharge(db: D1Database, p: Property, c: ChargeIn): Promise<Link> {
  const link = await linkCharge(db, p, c);
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT OR IGNORE INTO charges (id, property_id, gateway, at, amount_minor, kind, currency, uid, vsn, customer_ref,
           email, display_name, recurring, linked_via, subscription_ref)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
      )
      .bind(
        c.id, p.id, c.gateway, c.at, c.amountMinor, c.kind, c.currency.toUpperCase(), link.uid, link.vsn,
        c.customerRef ?? null, c.email ?? null, c.name ?? null, link.recurring ? 1 : 0, link.via, c.subscriptionRef ?? null,
      ),
  ];
  if (link.uid && c.kind === 'charge' && (c.email || c.name)) stmts.push(...enrichPerson(db, p.id, link.uid, c.at, c.email, c.name));
  await db.batch(stmts);
  return link;
}

/** A payment tells us who an anonymous browser belongs to. Never overwrites what's already known. */
export function enrichPerson(db: D1Database, pid: string, uid: string, at: number, email?: string | null, name?: string | null) {
  return [
    db.prepare('INSERT OR IGNORE INTO people (property_id, uid, first_at) VALUES (?1, ?2, ?3)').bind(pid, uid, at),
    db
      .prepare('UPDATE people SET email = COALESCE(email, ?1), display_name = COALESCE(display_name, ?2) WHERE property_id = ?3 AND uid = ?4')
      .bind(email ?? null, name ?? null, pid, uid),
  ];
}

/** Re-run linking for charges still without a buyer (e.g. recorded before the tracker caught the return page). */
export async function relinkOrphans(db: D1Database, p: Property) {
  const rows = (
    await db
      .prepare(`SELECT * FROM charges WHERE property_id = ?1 AND kind = 'charge' AND uid IS NULL ORDER BY at LIMIT 500`)
      .bind(p.id)
      .all<{
        id: string; at: number; amount_minor: number; currency: string; customer_ref: string | null; email: string | null;
        display_name: string | null; gateway: 'dodo' | 'api'; subscription_ref: string | null;
      }>()
  ).results;

  const report: { id: string; name: string | null; linked: boolean; note: string | null }[] = [];
  let linked = 0;
  for (const r of rows) {
    const link = await linkCharge(db, p, {
      id: r.id, gateway: r.gateway, at: r.at, amountMinor: r.amount_minor, kind: 'charge', currency: r.currency,
      customerRef: r.customer_ref, email: r.email, name: r.display_name, subscriptionRef: r.subscription_ref,
    });
    report.push({ id: r.id, name: r.display_name ?? r.email, linked: !!link.uid, note: link.note });
    if (!link.uid) continue;
    linked++;
    await db.batch([
      db
        .prepare('UPDATE charges SET uid = ?1, vsn = ?2, linked_via = ?3, recurring = ?4 WHERE property_id = ?5 AND id = ?6')
        .bind(link.uid, link.vsn, link.via, link.recurring ? 1 : 0, p.id, r.id),
      ...enrichPerson(db, p.id, link.uid, r.at, r.email, r.display_name),
    ]);
  }
  return { checked: rows.length, linked, report };
}
