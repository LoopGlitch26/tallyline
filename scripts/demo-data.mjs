// Writes .wrangler/demo.sql: 30 days of made-up traffic and sales for a demo website ("Inkpad").
// Load it with: npm run demo-data   (local database only)
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const PID = 'demoinkpad';
const DAY = 86_400_000;
const now = Date.now();
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

const ARRIVALS = [
  [{ source: 'Direct', channel: 'Direct', ref_host: null }, 30],
  [{ source: 'Google', channel: 'Search', ref_host: 'google.com' }, 26],
  [{ source: 'X', channel: 'Social', ref_host: 't.co', utm_campaign: 'launch-thread' }, 14],
  [{ source: 'ChatGPT', channel: 'AI', ref_host: 'chatgpt.com' }, 8],
  [{ source: 'Reddit', channel: 'Social', ref_host: 'reddit.com' }, 7],
  [{ source: 'Hacker News', channel: 'Social', ref_host: 'news.ycombinator.com' }, 5],
  [{ source: 'Newsletter', channel: 'Email', ref_host: null, utm_campaign: 'october-digest' }, 4],
  [{ source: 'Perplexity', channel: 'AI', ref_host: 'perplexity.ai' }, 3],
  [{ source: 'Product Hunt', channel: 'Referral', ref_host: 'producthunt.com' }, 3],
];
const PLACES = [
  ['US', 'California', 'San Francisco', 22],
  ['US', 'New York', 'New York', 14],
  ['IN', 'Karnataka', 'Bengaluru', 16],
  ['GB', 'England', 'London', 10],
  ['DE', 'Berlin', 'Berlin', 8],
  ['CA', 'Ontario', 'Toronto', 6],
  ['BR', 'São Paulo', 'São Paulo', 5],
  ['AU', 'New South Wales', 'Sydney', 4],
];
const AGENTS = [
  [['Chrome', 'macOS', 'Desktop'], 30],
  [['Chrome', 'Windows', 'Desktop'], 20],
  [['Mobile Safari', 'iOS', 'Mobile'], 22],
  [['Chrome', 'Android', 'Mobile'], 12],
  [['Safari', 'macOS', 'Desktop'], 8],
  [['Firefox', 'Linux', 'Desktop'], 5],
  [['Edge', 'Windows', 'Desktop'], 3],
];
const LANDINGS = [['/', 50], ['/blog/markdown-tips', 18], ['/pricing', 12], ['/blog/notes-app-comparison', 12], ['/changelog', 8]];
const NAMES = ['Maya Chen', 'Leo Park', 'Ana Ruiz', 'Sam Okafor', 'Priya Nair', 'Tom Becker', 'Ivy Moreau', 'Raj Mehta', 'Zoe Lind', 'Kai Sato'];

const sql = [`DELETE FROM hits WHERE property_id = '${PID}';`, `DELETE FROM visits WHERE property_id = '${PID}';`, `DELETE FROM people WHERE property_id = '${PID}';`, `DELETE FROM charges WHERE property_id = '${PID}';`, `DELETE FROM properties WHERE id = '${PID}';`];
sql.push(`INSERT INTO properties (id, label, host, tz, currency, secret_key, created) VALUES ('${PID}', 'Inkpad', 'inkpad.app', 'UTC', 'USD', 'tl_demo_key_do_not_use', ${now - 45 * DAY});`);

let charges = 0;
for (let d = 29; d >= 0; d--) {
  const visitorsToday = Math.round(60 + 25 * Math.sin(d / 3) + rand() * 30 + (29 - d) * 1.5);
  for (let i = 0; i < visitorsToday; i++) {
    const uid = randomUUID();
    const vsn = randomUUID();
    let began = now - d * DAY - Math.floor(rand() * DAY);
    if (began > now) began = now - Math.floor(rand() * 3_600_000);
    const a = weighted(ARRIVALS);
    const [country, region, city] = weighted(PLACES.map((p) => [p, p[3]]));
    const [browser, os, device] = weighted(AGENTS);
    const landing = weighted(LANDINGS);
    const path = [landing];
    if (rand() < 0.45) path.push('/pricing');
    if (rand() < 0.2) path.push('/features');
    const goals = [];
    if (path.includes('/pricing') && rand() < 0.35) goals.push('checkout_click');
    if (rand() < 0.08) goals.push('signup_click');
    const engaged = Math.floor(5_000 + rand() * 240_000 * path.length);
    const last = began + engaged;
    sql.push(`INSERT INTO people (property_id, uid, first_at) VALUES ('${PID}', '${uid}', ${began});`);
    sql.push(
      `INSERT INTO visits (property_id, vsn, uid, began, last_active, engaged_ms, views, conversions, host_name, landing, last_path, ref_url, ref_host, source, channel, utm_source, utm_medium, utm_campaign, tag, country, region, city, browser, os, device) VALUES (` +
        [PID, vsn, uid, began, last, engaged, path.length, goals.length, 'inkpad.app', landing, path[path.length - 1], a.ref_host ? a.ref_host + '/' : null, a.ref_host, a.source, a.channel, a.utm_campaign ? a.source.toLowerCase() : null, a.utm_campaign ? (a.channel === 'Email' ? 'email' : 'social') : null, a.utm_campaign ?? null, null, country, region, city, browser, os, device]
          .map(q)
          .join(', ') +
        ');',
    );
    path.forEach((p, j) => sql.push(`INSERT INTO hits (property_id, vsn, uid, at, kind, path) VALUES ('${PID}', '${vsn}', '${uid}', ${began + j * 40_000}, 'view', ${q(p)});`));
    goals.forEach((g, j) => sql.push(`INSERT INTO hits (property_id, vsn, uid, at, kind, label, path) VALUES ('${PID}', '${vsn}', '${uid}', ${began + 50_000 + j * 1000}, 'conversion', '${g}', '/pricing');`));
    if (goals.includes('checkout_click')) sql.push(`INSERT INTO hits (property_id, vsn, uid, at, kind, label, path) VALUES ('${PID}', '${vsn}', '${uid}', ${began + 60_000}, 'exit', 'https://checkout.dodopayments.com/buy/pdt_inkpad_pro', '/pricing');`);
    // Some checkout clickers pay; X and HN visitors convert better in this story.
    const boost = a.source === 'X' || a.source === 'Hacker News' ? 1.6 : a.channel === 'AI' ? 1.3 : 1;
    if (goals.includes('checkout_click') && rand() < 0.42 * boost) {
      const name = pick(NAMES);
      const email = name.toLowerCase().replace(' ', '.') + charges + '@example.com';
      const amount = weighted([[900, 5], [2900, 3], [9900, 1]]);
      const at = Math.min(now - 1000, began + 90_000);
      sql.push(`UPDATE people SET display_name = ${q(name)}, email = ${q(email)} WHERE property_id = '${PID}' AND uid = '${uid}';`);
      sql.push(`INSERT INTO charges (id, property_id, gateway, at, amount_minor, kind, currency, uid, vsn, customer_ref, email, display_name, recurring, linked_via) VALUES ('pay_demo${charges}', '${PID}', 'dodo', ${at}, ${amount}, 'charge', 'USD', '${uid}', '${vsn}', 'cus_demo${charges}', ${q(email)}, ${q(name)}, 0, '${rand() < 0.85 ? 'metadata' : 'return_visit'}');`);
      charges++;
    }
  }
}
mkdirSync('.wrangler', { recursive: true });
writeFileSync('.wrangler/demo.sql', sql.join('\n') + '\n');
console.log(`Wrote .wrangler/demo.sql (${sql.length} statements, ${charges} payments). Open /p/${PID} after loading it.`);
