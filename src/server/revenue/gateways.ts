import { json, readJson, text, type Req } from '../http/router';
import { checkStandardWebhook } from '../lib/crypto';
import { findProperty, minorDigits, type Property } from '../types';
import { saveCharge } from './ledger';

type Obj = Record<string, any>;

const firstString = (o: Obj | undefined, keys: string[]): string | null => {
  if (!o) return null;
  for (const k of keys) if (typeof o[k] === 'string' && o[k]) return o[k];
  return null;
};

const UID_KEYS = ['tl_uid', 'tallyline_uid', 'visitor_id', 'uid'];
const VSN_KEYS = ['tl_vsn', 'tallyline_vsn', 'session_id', 'vsn'];

/** POST /api/hooks/dodo/:pid — Dodo Payments webhook (payment.succeeded, refund.succeeded). */
export async function dodoWebhook(req: Req): Promise<Response> {
  const p = await findProperty(req.env.DB, req.params.pid);
  if (!p) return json({ error: 'unknown property' }, 404);
  if (!p.dodo_secret) return json({ error: 'no Dodo webhook secret saved for this property' }, 400);

  const body = await req.raw.text();
  const h = req.raw.headers;
  const ok = await checkStandardWebhook(p.dodo_secret, { id: h.get('webhook-id'), timestamp: h.get('webhook-timestamp'), signature: h.get('webhook-signature') }, body);
  if (!ok) return json({ error: 'bad signature' }, 401);

  let evt: { type?: string; timestamp?: string; data?: Obj };
  try {
    evt = JSON.parse(body);
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const data = evt.data ?? {};
  const customer: Obj = data.customer ?? {};
  const meta: Obj = { ...(customer.metadata ?? {}), ...(data.metadata ?? {}) };
  const at = Date.parse(data.created_at ?? evt.timestamp ?? '') || Date.now();
  const email = firstString(customer, ['email'])?.toLowerCase() ?? null;

  if (evt.type === 'payment.succeeded') {
    let amount = Number(data.total_amount) || 0;
    let currency = String(data.currency ?? p.currency).toUpperCase();
    // Convert only when Dodo tells us the settled amount in the property's currency.
    const settled = typeof data.settlement_currency === 'string' ? data.settlement_currency.toUpperCase() : null;
    if (currency !== p.currency && settled === p.currency) {
      amount = Number(data.settlement_amount) || amount;
      currency = settled;
    }
    await saveCharge(req.env.DB, p, {
      id: String(data.payment_id),
      gateway: 'dodo',
      at,
      amountMinor: amount,
      kind: 'charge',
      currency,
      uid: firstString(meta, UID_KEYS),
      vsn: firstString(meta, VSN_KEYS),
      customerRef: firstString(customer, ['customer_id']) ?? firstString(data, ['customer_id']),
      email,
      name: firstString(customer, ['name']),
      subscriptionRef: firstString(data, ['subscription_id']) ?? (Array.isArray(data.subscription_ids) ? data.subscription_ids[0] ?? null : null),
    });
  } else if (evt.type === 'refund.succeeded') {
    const original = await req.env.DB.prepare('SELECT uid, vsn, currency, amount_minor FROM charges WHERE property_id = ?1 AND id = ?2')
      .bind(p.id, String(data.payment_id))
      .first<{ uid: string | null; vsn: string | null; currency: string; amount_minor: number }>();
    const amount = Math.abs(Number(data.amount) || original?.amount_minor || 0);
    await req.env.DB.prepare(
      `INSERT OR IGNORE INTO charges (id, property_id, gateway, at, amount_minor, kind, currency, uid, vsn, customer_ref, email, display_name)
       VALUES (?1, ?2, 'dodo', ?3, ?4, 'refund', ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
      .bind(
        String(data.refund_id ?? `refund-${data.payment_id}`),
        p.id,
        at,
        -amount,
        String(data.currency ?? original?.currency ?? p.currency).toUpperCase(),
        original?.uid ?? null,
        original?.vsn ?? null,
        firstString(customer, ['customer_id']),
        email,
        firstString(customer, ['name']),
      )
      .run();
  }
  // Acknowledge every other event so Dodo stops retrying it.
  return json({ received: true });
}

async function propertyFromKey(req: Req): Promise<Property | null> {
  const auth = req.raw.headers.get('authorization') ?? '';
  const key = auth.replace(/^Bearer\s+/i, '').trim();
  if (!key) return null;
  return req.env.DB.prepare('SELECT * FROM properties WHERE secret_key = ?1').bind(key).first<Property>();
}

/**
 * POST /api/v1/payment — record a payment from any provider.
 * Body: { "id": "txn_1", "amount": 29.99, "currency": "USD", "uid": "<tl_uid cookie>", "email": "...", "refund": false }
 */
export async function paymentApi(req: Req): Promise<Response> {
  const p = await propertyFromKey(req);
  if (!p) return json({ error: 'invalid API key' }, 401);
  const b = await readJson(req);
  const id = text(b?.id ?? b?.transaction_id, 200);
  if (!b || !id || typeof b.amount !== 'number' || !Number.isFinite(b.amount)) {
    return json({ error: '"id" (string) and "amount" (number in major units, e.g. 29.99) are required' }, 400);
  }
  const currency = (text(b.currency, 3) ?? p.currency).toUpperCase();
  const minor = Math.round(b.amount * 10 ** minorDigits(currency));
  const refund = b.refund === true || b.refunded === true;
  const link = await saveCharge(req.env.DB, p, {
    id: `${p.id}:${id}${refund ? ':refund' : ''}`,
    gateway: 'api',
    at: typeof b.at === 'string' ? Date.parse(b.at) || Date.now() : typeof b.timestamp === 'string' ? Date.parse(b.timestamp) || Date.now() : Date.now(),
    amountMinor: refund ? -Math.abs(minor) : minor,
    kind: refund ? 'refund' : 'charge',
    currency,
    uid: text(b.uid ?? b.visitor_id, 64),
    vsn: text(b.vsn ?? b.session_id, 64),
    customerRef: text(b.customer_id, 128),
    email: text(b.email, 200)?.toLowerCase() ?? null,
    name: text(b.name, 128),
    recurring: b.renewal === true || b.recurring === true,
  });
  return json({ ok: true, linked: !!link.uid, uid: link.uid, via: link.via });
}

/**
 * POST /api/v1/conversion — record a goal from your backend (e.g. "signup_completed").
 * Body: { "uid": "<tl_uid cookie>", "name": "signup_completed", "meta": { ... } }
 */
export async function conversionApi(req: Req): Promise<Response> {
  const p = await propertyFromKey(req);
  if (!p) return json({ error: 'invalid API key' }, 401);
  const b = await readJson(req);
  const uid = text(b?.uid ?? b?.visitor_id, 64);
  const name = text(b?.name, 64);
  if (!uid || !name) return json({ error: '"uid" and "name" are required' }, 400);
  const visit = await req.env.DB.prepare('SELECT vsn, last_path FROM visits WHERE property_id = ?1 AND uid = ?2 ORDER BY began DESC LIMIT 1')
    .bind(p.id, uid)
    .first<{ vsn: string; last_path: string | null }>();
  if (!visit) return json({ error: 'no visits found for this uid' }, 404);
  const meta = b?.meta ?? b?.props;
  await req.env.DB.batch([
    req.env.DB.prepare('UPDATE visits SET conversions = conversions + 1 WHERE property_id = ?1 AND vsn = ?2').bind(p.id, visit.vsn),
    req.env.DB.prepare(`INSERT INTO hits (property_id, vsn, uid, at, kind, label, path, meta) VALUES (?1, ?2, ?3, ?4, 'conversion', ?5, ?6, ?7)`).bind(
      p.id,
      visit.vsn,
      uid,
      Date.now(),
      name,
      visit.last_path,
      meta && typeof meta === 'object' ? JSON.stringify(meta).slice(0, 1000) : null,
    ),
  ]);
  return json({ ok: true });
}
