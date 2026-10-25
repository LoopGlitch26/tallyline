import { classifyTraffic } from '../../common/sources';
import { empty, type Req } from '../http/router';
import { looksLikeBot, parseAgent } from '../lib/agent';
import { CREDITED_VISIT_SQL, CREDIT_GRACE_MS } from '../revenue/credit';
import { findProperty, type Property } from '../types';

/** What the tracker (public/t.js) sends. Kept short because it goes out on every page. */
export interface Beacon {
  site: string;
  kind: 'view' | 'conversion' | 'exit' | 'beat' | 'who';
  url: string;
  uid: string;
  vsn: string;
  ref?: string;
  sw?: number;
  label?: string;
  meta?: Record<string, unknown>;
  ms?: number;
}

export interface Geo {
  country: string | null;
  region: string | null;
  city: string | null;
}

const KINDS = new Set<Beacon['kind']>(['view', 'conversion', 'exit', 'beat', 'who']);
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_BEAT_MS = 10 * 60_000;
const MAX_BODY = 8 * 1024;

const clean = (v: unknown, max = 255): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

export const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');

/** True when `hostname` is the property's domain or one of its subdomains. */
export function isOwnHost(hostname: string, domain: string): boolean {
  const h = bareHost(hostname);
  const d = bareHost(domain);
  return h === d || h.endsWith('.' + d);
}

/** "/Blog/Post/" -> "/Blog/Post", decoded, capped. */
export function tidyPath(p: string): string {
  let out = p || '/';
  try {
    out = decodeURI(out);
  } catch {
    /* keep encoded */
  }
  while (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out.slice(0, 500);
}

function validBeacon(b: unknown): b is Beacon {
  if (!b || typeof b !== 'object') return false;
  const x = b as Beacon;
  return ID_RE.test(String(x.site)) && KINDS.has(x.kind) && ID_RE.test(String(x.uid)) && ID_RE.test(String(x.vsn)) && typeof x.url === 'string';
}

/** POST /api/collect */
export async function collect(req: Req): Promise<Response> {
  const cors = { 'access-control-allow-origin': '*' };
  const raw = await req.raw.text();
  if (raw.length > MAX_BODY) return empty(413, cors);
  let beacon: unknown;
  try {
    beacon = JSON.parse(raw);
  } catch {
    return empty(400, cors);
  }
  if (!validBeacon(beacon)) return empty(400, cors);

  const ua = req.raw.headers.get('user-agent') ?? '';
  if (looksLikeBot(ua)) return empty(202, cors);

  const property = await findProperty(req.env.DB, beacon.site);
  if (!property) return empty(404, cors);

  let page: URL;
  try {
    page = new URL(beacon.url);
  } catch {
    return empty(400, cors);
  }
  // Refuse data for other domains so nobody can pollute your numbers by copying the snippet.
  if (!isOwnHost(page.hostname, property.host)) return empty(403, cors);

  await recordBeacon(req.env.DB, property, beacon, page, ua, geoFrom(req.raw), Date.now());
  return empty(202, cors);
}

/**
 * Where the visitor is. If the tracker is proxied through the site's own server (to dodge ad blockers),
 * Cloudflare sees that server's location, so a proxy's forwarded geo headers win when present.
 */
export function geoFrom(r: Request): Geo {
  const h = (name: string) => {
    const v = r.headers.get(name);
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  if (h('x-vercel-ip-country')) return { country: h('x-vercel-ip-country'), region: h('x-vercel-ip-country-region'), city: h('x-vercel-ip-city') };
  if (h('x-tallyline-country')) return { country: h('x-tallyline-country'), region: h('x-tallyline-region'), city: h('x-tallyline-city') };
  const cf = (r as Request & { cf?: Record<string, unknown> }).cf;
  return { country: (cf?.country as string) ?? null, region: (cf?.region as string) ?? null, city: (cf?.city as string) ?? null };
}

interface Arrival {
  refUrl: string | null;
  refHost: string | null;
  utm: Record<'source' | 'medium' | 'campaign' | 'term' | 'content', string | null>;
  tag: string | null;
  source: string;
  channel: string;
}

/** Work out where this visit came from (only used when the visit is new). */
export function arrivalFrom(page: URL, referrer: string | undefined, domain: string): Arrival {
  let refUrl: string | null = null;
  let refHost: string | null = null;
  if (referrer) {
    try {
      const r = new URL(referrer);
      // Moving between your own pages and subdomains is not a referral.
      if ((r.protocol === 'https:' || r.protocol === 'http:') && !isOwnHost(r.hostname, domain)) {
        refHost = bareHost(r.hostname);
        refUrl = (refHost + tidyPath(r.pathname)).slice(0, 500);
      } else if (r.protocol === 'android-app:' && r.hostname) {
        // Android apps send e.g. android-app://com.google.android.gm
        refHost = r.hostname.toLowerCase();
      }
    } catch {
      /* not a URL: ignore */
    }
  }
  const q = page.searchParams;
  const utm = {
    source: clean(q.get('utm_source'), 100),
    medium: clean(q.get('utm_medium'), 100),
    campaign: clean(q.get('utm_campaign'), 200),
    term: clean(q.get('utm_term'), 200),
    content: clean(q.get('utm_content'), 200),
  };
  const tag = clean(q.get('ref') ?? q.get('via'), 100);
  const verdict = classifyTraffic({ refHost, utmSource: utm.source, utmMedium: utm.medium, tag });
  return { refUrl, refHost, utm, tag, ...verdict };
}

/** Writes a beacon. Separate from collect() so tests and the e2e script can call it directly. */
export async function recordBeacon(db: D1Database, p: Property, b: Beacon, page: URL, ua: string, geo: Geo, now: number) {
  const path = tidyPath(page.pathname);

  if (b.kind === 'beat') {
    const ms = Math.min(MAX_BEAT_MS, Math.max(0, Math.round(Number(b.ms) || 0)));
    await db
      .prepare('UPDATE visits SET engaged_ms = engaged_ms + ?1, last_active = ?2 WHERE property_id = ?3 AND vsn = ?4')
      .bind(ms, now, p.id, b.vsn)
      .run();
    return;
  }

  const ensurePerson = db.prepare('INSERT OR IGNORE INTO people (property_id, uid, first_at) VALUES (?1, ?2, ?3)').bind(p.id, b.uid, now);

  if (b.kind === 'who') {
    const m = b.meta ?? {};
    await db.batch([
      ensurePerson,
      db
        .prepare(
          `UPDATE people SET ext_id = COALESCE(?1, ext_id), email = COALESCE(?2, email), display_name = COALESCE(?3, display_name)
           WHERE property_id = ?4 AND uid = ?5`,
        )
        .bind(clean(m.user_id ?? m.id, 128), clean(m.email, 200)?.toLowerCase() ?? null, clean(m.name, 128), p.id, b.uid),
    ]);
    return;
  }

  let label: string | null = null;
  if (b.kind === 'conversion') label = clean(b.label, 64);
  if (b.kind === 'exit') label = clean(b.label, 500);
  if (b.kind !== 'view' && !label) return;

  // One upsert creates the visit on its first hit (with attribution) or bumps its counters afterwards.
  const a = arrivalFrom(page, b.ref, p.host);
  const agent = parseAgent(ua, Number(b.sw) || undefined);
  const isView = b.kind === 'view' ? 1 : 0;
  const isConv = b.kind === 'conversion' ? 1 : 0;
  const upsertVisit = db
    .prepare(
      `INSERT INTO visits (property_id, vsn, uid, began, last_active, views, conversions, host_name, landing, last_path,
         ref_url, ref_host, source, channel, utm_source, utm_medium, utm_campaign, utm_term, utm_content, tag,
         country, region, city, browser, os, device)
       VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)
       ON CONFLICT (property_id, vsn) DO UPDATE SET
         views = views + excluded.views,
         conversions = conversions + excluded.conversions,
         last_active = excluded.last_active,
         last_path = CASE WHEN excluded.views > 0 THEN excluded.last_path ELSE last_path END`,
    )
    .bind(
      p.id, b.vsn, b.uid, now, isView, isConv, bareHost(page.hostname), path,
      a.refUrl, a.refHost, a.source, a.channel, a.utm.source, a.utm.medium, a.utm.campaign, a.utm.term, a.utm.content, a.tag,
      geo.country, geo.region, geo.city, agent.browser, agent.os, agent.device,
    );

  const meta = b.kind === 'conversion' && b.meta && typeof b.meta === 'object' ? JSON.stringify(b.meta).slice(0, 1000) : null;
  const insertHit = db
    .prepare('INSERT INTO hits (property_id, vsn, uid, at, kind, label, path, meta) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
    .bind(p.id, b.vsn, b.uid, now, b.kind, label, path, meta);

  const stmts = [ensurePerson, upsertVisit, insertHit];
  if (b.kind === 'view') stmts.push(...checkoutReturn(db, p.id, b.uid, page, now));
  await db.batch(stmts);
}

/**
 * Dodo sends the buyer back to the return URL with ?payment_id=pay_... (or ?subscription_id=sub_...).
 * Seeing that on a page view ties the payment to this exact browser, even when checkout metadata was lost.
 */
function checkoutReturn(db: D1Database, pid: string, uid: string, page: URL, now: number): D1PreparedStatement[] {
  const ref = page.searchParams.get('payment_id') ?? page.searchParams.get('subscription_id');
  if (!ref || !/^(pay|sub)_[A-Za-z0-9_-]{4,64}$/.test(ref)) return [];
  return [
    db.prepare('INSERT OR IGNORE INTO checkout_returns (property_id, charge_ref, uid, at) VALUES (?1, ?2, ?3, ?4)').bind(pid, ref, uid, now),
    // The webhook often lands first: link that charge now unless something already did.
    db
      .prepare(
        `UPDATE charges SET uid = ?2, linked_via = 'return_visit',
           vsn = (${CREDITED_VISIT_SQL})
         WHERE property_id = ?1 AND (id = ?4 OR subscription_ref = ?4) AND uid IS NULL`,
      )
      .bind(pid, uid, now + CREDIT_GRACE_MS, ref),
    db
      .prepare(
        `UPDATE people SET
           email = COALESCE(email, (SELECT email FROM charges WHERE property_id = ?1 AND (id = ?3 OR subscription_ref = ?3) LIMIT 1)),
           display_name = COALESCE(display_name, (SELECT display_name FROM charges WHERE property_id = ?1 AND (id = ?3 OR subscription_ref = ?3) LIMIT 1))
         WHERE property_id = ?1 AND uid = ?2`,
      )
      .bind(pid, uid, ref),
  ];
}
