import { newId } from '../lib/crypto';
import { isTimeZone } from '../lib/period';
import { cleanSteps, breakdown, buyers, funnelReport, people, personProfile, summary } from '../reports/reports';
import { Scope } from '../reports/scope';
import { relinkOrphans } from '../revenue/ledger';
import { dropCachedProperty, type Property } from '../types';
import { json, readJson, text, type Guard, type Req } from './router';

const prop = (req: Req) => req.locals.property as Property;

/** Guard: loads :pid into req.locals.property. */
export const loadProperty: Guard = async (req) => {
  const p = await req.env.DB.prepare('SELECT * FROM properties WHERE id = ?1').bind(req.params.pid).first<Property>();
  if (!p) return json({ error: 'property not found' }, 404);
  req.locals.property = p;
};

/** Never send the webhook secret back to the browser. */
const visible = (p: Property) => ({ ...p, dodo_secret: null, has_dodo_secret: !!p.dodo_secret });

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#:]/)[0];
}
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

const newKey = () => 'tl_' + newId(28);

export async function listProperties(req: Req) {
  const now = Date.now();
  const [props, stats] = await req.env.DB.batch([
    req.env.DB.prepare('SELECT * FROM properties ORDER BY created'),
    req.env.DB.prepare(
      `SELECT property_id, COUNT(DISTINCT uid) AS visitors, COUNT(DISTINCT CASE WHEN last_active > ?1 THEN uid END) AS online
       FROM visits WHERE began > ?2 GROUP BY property_id`,
    ).bind(now - 5 * 60_000, now - 86_400_000),
  ]);
  const byId = new Map((stats.results as any[]).map((r) => [r.property_id, r]));
  return json(
    (props.results as unknown as Property[]).map((p) => ({ ...visible(p), visitors_24h: byId.get(p.id)?.visitors ?? 0, online: byId.get(p.id)?.online ?? 0 })),
  );
}

export async function createProperty(req: Req) {
  const b = (await readJson(req)) ?? {};
  const host = normalizeDomain(String(b.host ?? b.domain ?? ''));
  if (!DOMAIN_RE.test(host)) return json({ error: 'Enter a domain such as example.com' }, 400);
  const tz = typeof b.tz === 'string' && isTimeZone(b.tz) ? b.tz : 'UTC';
  const currency = typeof b.currency === 'string' && /^[A-Za-z]{3}$/.test(b.currency) ? b.currency.toUpperCase() : 'USD';
  const p: Property = {
    id: newId(10),
    label: text(b.label, 100) ?? host,
    host,
    tz,
    currency,
    secret_key: newKey(),
    dodo_secret: null,
    created: Date.now(),
  };
  await req.env.DB.prepare('INSERT INTO properties (id, label, host, tz, currency, secret_key, dodo_secret, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)')
    .bind(p.id, p.label, p.host, p.tz, p.currency, p.secret_key, p.created)
    .run();
  return json(visible(p), 201);
}

export const getProperty = (req: Req) => json(visible(prop(req)));

export async function updateProperty(req: Req) {
  const cur = prop(req);
  const b = (await readJson(req)) ?? {};
  const next = { ...cur };
  if (text(b.label, 100)) next.label = text(b.label, 100)!;
  if (typeof b.host === 'string') {
    const h = normalizeDomain(b.host);
    if (!DOMAIN_RE.test(h)) return json({ error: 'Enter a domain such as example.com' }, 400);
    next.host = h;
  }
  if (typeof b.tz === 'string') {
    if (!isTimeZone(b.tz)) return json({ error: `Unknown time zone "${b.tz}"` }, 400);
    next.tz = b.tz;
  }
  if (typeof b.currency === 'string') {
    if (!/^[A-Za-z]{3}$/.test(b.currency)) return json({ error: 'Currency must be a 3-letter code like USD' }, 400);
    next.currency = b.currency.toUpperCase();
  }
  if (typeof b.dodo_secret === 'string') next.dodo_secret = b.dodo_secret.trim() || null;
  await req.env.DB.prepare('UPDATE properties SET label = ?1, host = ?2, tz = ?3, currency = ?4, dodo_secret = ?5 WHERE id = ?6')
    .bind(next.label, next.host, next.tz, next.currency, next.dodo_secret, cur.id)
    .run();
  dropCachedProperty(cur.id);
  return json(visible(next));
}

export async function rotateKey(req: Req) {
  const key = newKey();
  await req.env.DB.prepare('UPDATE properties SET secret_key = ?1 WHERE id = ?2').bind(key, prop(req).id).run();
  return json({ secret_key: key });
}

export async function deleteProperty(req: Req) {
  const id = prop(req).id;
  const db = req.env.DB;
  await db.batch([
    ...['hits', 'visits', 'people', 'charges', 'checkout_returns', 'funnels'].map((t) => db.prepare(`DELETE FROM ${t} WHERE property_id = ?1`).bind(id)),
    db.prepare('DELETE FROM properties WHERE id = ?1').bind(id),
  ]);
  dropCachedProperty(id);
  return json({ ok: true });
}

// ---- reports

const scope = (req: Req) => Scope.fromQuery(req.env.DB, prop(req), req.url.searchParams);

export const summaryRoute = async (req: Req) => json(await summary(scope(req)));

export async function breakdownRoute(req: Req) {
  try {
    return json(await breakdown(scope(req), req.url.searchParams.get('by') ?? 'source', Number(req.url.searchParams.get('limit')) || 100));
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
}

export const buyersRoute = async (req: Req) => json(await buyers(scope(req)));
export const peopleRoute = async (req: Req) => json(await people(scope(req)));
export const personRoute = async (req: Req) => json(await personProfile(req.env.DB, prop(req), req.params.uid));
export const relinkRoute = async (req: Req) => json(await relinkOrphans(req.env.DB, prop(req)));

// ---- funnels

export async function listFunnels(req: Req) {
  const rows = await req.env.DB.prepare('SELECT id, title, steps_json, created FROM funnels WHERE property_id = ?1 ORDER BY created').bind(prop(req).id).all<any>();
  return json(rows.results.map((f) => ({ id: f.id, title: f.title, steps: JSON.parse(f.steps_json), created: f.created })));
}

export async function createFunnel(req: Req) {
  const b = (await readJson(req)) ?? {};
  const title = text(b.title, 100);
  const steps = cleanSteps(b.steps);
  if (!title || steps.length < 2) return json({ error: 'Give the funnel a name and at least 2 steps' }, 400);
  const id = newId(10);
  await req.env.DB.prepare('INSERT INTO funnels (id, property_id, title, steps_json, created) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(id, prop(req).id, title, JSON.stringify(steps), Date.now())
    .run();
  return json({ id, title, steps }, 201);
}

export async function deleteFunnel(req: Req) {
  await req.env.DB.prepare('DELETE FROM funnels WHERE property_id = ?1 AND id = ?2').bind(prop(req).id, req.params.fid).run();
  return json({ ok: true });
}

export async function funnelRoute(req: Req) {
  const f = await req.env.DB.prepare('SELECT steps_json FROM funnels WHERE property_id = ?1 AND id = ?2').bind(prop(req).id, req.params.fid).first<{ steps_json: string }>();
  if (!f) return json({ error: 'funnel not found' }, 404);
  return json(await funnelReport(scope(req), JSON.parse(f.steps_json)));
}
