// 60 days of made-up traffic and sales for the demo website "Inkpad".
// Same story as scripts/demo-data.mjs, written straight into the in-browser database.
import type { Database } from 'sql.js';

export const DEMO_ID = 'demoinkpad';
const DAY = 86_400_000;

let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
function weighted<T>(pairs: [T, number][]): T {
  let r = rand() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
}
const uuid = () => crypto.randomUUID();

interface Arrival {
  source: string;
  channel: string;
  host: string | null;
  campaign?: string;
  term?: string;
  tag?: string;
}
const ARRIVALS: [Arrival, number][] = [
  [{ source: 'Direct', channel: 'Direct', host: null }, 28],
  [{ source: 'Google', channel: 'Search', host: 'google.com' }, 24],
  [{ source: 'X', channel: 'Social', host: 't.co', campaign: 'launch-thread' }, 9],
  [{ source: 'X', channel: 'Social', host: 't.co', campaign: 'pricing-thread' }, 4],
  [{ source: 'ChatGPT', channel: 'AI', host: 'chatgpt.com' }, 8],
  [{ source: 'Reddit', channel: 'Social', host: 'reddit.com' }, 7],
  [{ source: 'Hacker News', channel: 'Social', host: 'news.ycombinator.com', tag: 'show-hn' }, 5],
  [{ source: 'Newsletter', channel: 'Email', host: null, campaign: 'october-digest' }, 4],
  [{ source: 'Perplexity', channel: 'AI', host: 'perplexity.ai' }, 3],
  [{ source: 'Claude', channel: 'AI', host: 'claude.ai' }, 2],
  [{ source: 'Product Hunt', channel: 'Referral', host: 'producthunt.com' }, 3],
  [{ source: 'Google', channel: 'Paid', host: 'google.com', campaign: 'brand-search', term: 'markdown notes app' }, 3],
];
const PLACES: [[string, string, string], number][] = [
  [['US', 'California', 'San Francisco'], 14],
  [['US', 'New York', 'New York'], 10],
  [['US', 'Texas', 'Austin'], 5],
  [['IN', 'Karnataka', 'Bengaluru'], 12],
  [['IN', 'Maharashtra', 'Mumbai'], 5],
  [['GB', 'England', 'London'], 9],
  [['DE', 'Berlin', 'Berlin'], 7],
  [['CA', 'Ontario', 'Toronto'], 5],
  [['FR', 'Île-de-France', 'Paris'], 4],
  [['BR', 'São Paulo', 'São Paulo'], 4],
  [['AU', 'New South Wales', 'Sydney'], 3],
  [['JP', 'Tokyo', 'Tokyo'], 3],
];
const AGENTS: [[string, string, string], number][] = [
  [['Chrome', 'macOS', 'Desktop'], 28],
  [['Chrome', 'Windows', 'Desktop'], 18],
  [['Mobile Safari', 'iOS', 'Mobile'], 20],
  [['Chrome', 'Android', 'Mobile'], 11],
  [['Safari', 'macOS', 'Desktop'], 8],
  [['Firefox', 'Linux', 'Desktop'], 5],
  [['Edge', 'Windows', 'Desktop'], 4],
  [['Arc', 'macOS', 'Desktop'], 3],
  [['Mobile Safari', 'iPadOS', 'Tablet'], 3],
];
const LANDINGS: [string, number][] = [
  ['/', 46],
  ['/blog/markdown-tips', 16],
  ['/blog/best-notes-apps-2026', 12],
  ['/pricing', 11],
  ['/changelog', 6],
  ['/templates/meeting-notes', 9],
];
const NAMES = ['Maya Chen', 'Leo Park', 'Ana Ruiz', 'Sam Okafor', 'Priya Nair', 'Tom Becker', 'Ivy Moreau', 'Raj Mehta', 'Zoe Lind', 'Kai Sato', 'Nora Haddad', 'Eli Brooks'];
const PRICES: [number, number][] = [
  [900, 5],
  [2900, 3],
  [9900, 1],
];

export function loadSample(db: Database, now = Date.now()) {
  db.run('BEGIN');
  db.run(`INSERT INTO properties (id, label, host, tz, currency, secret_key, created) VALUES (?, 'Inkpad', 'inkpad.app', ?, 'USD', 'tl_demo_key_not_real', ?)`, [
    DEMO_ID,
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    now - 70 * DAY,
  ]);
  db.run(`INSERT INTO properties (id, label, host, tz, currency, secret_key, created) VALUES ('demoledger', 'Ledgerly docs', 'docs.ledgerly.io', 'UTC', 'EUR', 'tl_demo_key_2', ?)`, [now - 20 * DAY]);

  const person = db.prepare('INSERT INTO people (property_id, uid, first_at, display_name, email) VALUES (?, ?, ?, ?, ?)');
  const visit = db.prepare(
    `INSERT INTO visits (property_id, vsn, uid, began, last_active, engaged_ms, views, conversions, host_name, landing, last_path,
      ref_url, ref_host, source, channel, utm_source, utm_medium, utm_campaign, utm_term, tag, country, region, city, browser, os, device)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const hit = db.prepare('INSERT INTO hits (property_id, vsn, uid, at, kind, label, path, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const charge = db.prepare(
    `INSERT INTO charges (id, property_id, gateway, at, amount_minor, kind, currency, uid, vsn, customer_ref, email, display_name, recurring, linked_via)
     VALUES (?, ?, 'dodo', ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?)`,
  );

  let n = 0;
  const buyers: { uid: string; vsn: string; name: string; email: string; amount: number; at: number }[] = [];
  for (let d = 59; d >= 0; d--) {
    // Traffic grows over the two months, with a launch spike 18 days ago.
    const base = 55 + (59 - d) * 0.9 + 18 * Math.sin(d / 3.2);
    const spike = d === 18 ? 140 : d === 17 ? 60 : 0;
    const count = Math.round(base + spike + rand() * 20);
    for (let i = 0; i < count; i++) {
      const uid = uuid();
      const vsn = uuid();
      let a = weighted(ARRIVALS);
      if (spike && rand() < 0.6) a = ARRIVALS[6][0];
      // Today's latest visitors are still on the site ("online now").
      const began = d === 0 && i < 6 ? now - Math.floor(rand() * 240_000) : Math.min(now - 300_000, now - d * DAY - Math.floor(rand() * DAY));
      const [country, region, city] = weighted(PLACES);
      const [browser, os, device] = weighted(AGENTS);
      const landing = weighted(LANDINGS);
      const path = [landing];
      if (landing !== '/pricing' && rand() < 0.42) path.push('/pricing');
      if (rand() < 0.18) path.push('/features');
      if (rand() < 0.1) path.push('/blog/markdown-tips');
      const goals: string[] = [];
      if (path.includes('/pricing') && rand() < 0.36) goals.push('checkout_click');
      if (rand() < 0.1) goals.push('signup_click');
      if (path.includes('/templates/meeting-notes') || (landing.startsWith('/templates') && rand() < 0.5)) goals.push('template_download');
      const engaged = Math.floor(4_000 + rand() * 150_000 * path.length);
      const last = d === 0 && i < 6 ? now - Math.floor(rand() * 60_000) : began + engaged;
      const utmSource = a.campaign ? (a.channel === 'Email' ? 'newsletter' : a.source.toLowerCase()) : null;
      const utmMedium = a.campaign ? (a.channel === 'Email' ? 'email' : a.channel === 'Paid' ? 'cpc' : 'social') : null;
      person.run([DEMO_ID, uid, began, null, null]);
      visit.run([
        DEMO_ID, vsn, uid, began, last, engaged, path.length, goals.length, rand() < 0.12 ? 'app.inkpad.app' : 'inkpad.app', landing, path[path.length - 1],
        a.host ? a.host + (a.host === 'reddit.com' ? '/r/productivity' : a.host === 'news.ycombinator.com' ? '/item' : '/') : null, a.host, a.source, a.channel,
        utmSource, utmMedium, a.campaign ?? null, a.term ?? null, a.tag ?? null, country, region, city, browser, os, device,
      ]);
      path.forEach((p, j) => hit.run([DEMO_ID, vsn, uid, began + j * 38_000, 'view', null, p, null]));
      goals.forEach((g, j) => hit.run([DEMO_ID, vsn, uid, began + 45_000 + j * 2000, 'conversion', g, g === 'template_download' ? landing : '/pricing', g === 'checkout_click' ? '{"plan":"pro"}' : null]));
      if (goals.includes('checkout_click')) hit.run([DEMO_ID, vsn, uid, began + 52_000, 'exit', 'https://checkout.dodopayments.com/buy/pdt_inkpad_pro', '/pricing', null]);
      if (rand() < 0.05) hit.run([DEMO_ID, vsn, uid, began + 20_000, 'exit', pick(['https://github.com/inkpad/inkpad', 'https://x.com/inkpadapp', 'https://discord.gg/inkpad']), landing, null]);

      const boost = a.source === 'X' || a.source === 'Hacker News' ? 1.7 : a.channel === 'AI' ? 1.35 : a.channel === 'Search' ? 0.8 : 1;
      if (goals.includes('checkout_click') && rand() < 0.4 * boost) {
        const name = NAMES[n % NAMES.length];
        const email = name.toLowerCase().replace(' ', '.') + n + '@example.com';
        const amount = weighted(PRICES);
        const at = Math.min(now - 1000, began + 95_000);
        db.run('UPDATE people SET display_name = ?, email = ? WHERE property_id = ? AND uid = ?', [name, email, DEMO_ID, uid]);
        hit.run([DEMO_ID, vsn, uid, at + 4000, 'view', null, '/thanks', null]);
        const via = rand() < 0.82 ? 'metadata' : pick(['return_visit', 'email', 'timing']);
        charge.run([`pay_demo${n}`, DEMO_ID, at, amount, 'charge', uid, vsn, `cus_demo${n}`, email, name, 0, via]);
        buyers.push({ uid, vsn, name, email, amount, at });
        n++;
      }
    }
  }
  // Renewals 30 days later, a couple of refunds, and one payment nobody could be matched to.
  for (const b of buyers) {
    if (b.at + 30 * DAY < now && rand() < 0.7)
      charge.run([`pay_renew_${b.uid.slice(0, 8)}`, DEMO_ID, b.at + 30 * DAY, b.amount, 'charge', b.uid, b.vsn, `cus_${b.uid.slice(0, 6)}`, b.email, b.name, 1, 'prior_charge']);
  }
  buyers.slice(3, 5).forEach((b, i) => charge.run([`ref_demo${i}`, DEMO_ID, b.at + 2 * DAY, -b.amount, 'refund', b.uid, b.vsn, null, b.email, b.name, 0, null]));
  charge.run(['pay_unmatched1', DEMO_ID, now - 2 * DAY, 2900, 'charge', null, null, 'cus_x1', 'dana@example.com', 'Dana Wu', 0, null]);

  // A saved funnel.
  db.run(`INSERT INTO funnels (id, property_id, title, steps_json, created) VALUES ('fn_demo', ?, 'Blog → pricing → checkout', ?, ?)`, [
    DEMO_ID,
    JSON.stringify([
      { kind: 'page', match: '/blog/*' },
      { kind: 'page', match: '/pricing' },
      { kind: 'goal', match: 'checkout_click' },
      { kind: 'page', match: '/thanks' },
    ]),
    now - 10 * DAY,
  ]);
  [person, visit, hit, charge].forEach((s) => s.free());
  db.run('COMMIT');
}
