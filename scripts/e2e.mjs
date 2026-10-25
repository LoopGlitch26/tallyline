// End-to-end check against a running dev server (npm run dev). Usage: node scripts/e2e.mjs [baseUrl]
// Reads the password from .dev.vars. Creates a throwaway property, exercises every API, then deletes it.
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
let cookie = '';
let failures = 0;

function check(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else {
    failures++;
    console.log('  ✗', msg);
  }
}

async function api(path, { method, body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', cookie, 'user-agent': UA, ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const beacon = (body) => api('/api/collect', { body, headers: { 'content-type': 'text/plain' } });
const id = () => randomUUID();

console.log('auth');
check((await api('/api/properties')).status === 401, 'dashboard API needs login');
check((await api('/api/session', { body: { password: 'nope' } })).status === 401, 'wrong password rejected');
check((await api('/api/session', { body: { password: vars.DASHBOARD_PASSWORD } })).status === 200, 'login works');
check((await api('/api/session')).data.signedIn === true, 'session cookie accepted');

console.log('properties');
const created = await api('/api/properties', { body: { host: 'https://www.e2e-shop.com/', label: 'E2E Shop', tz: 'Asia/Kolkata', currency: 'USD' } });
check(created.status === 201 && created.data.host === 'e2e-shop.com', 'create property, domain normalized');
const P = created.data;
check((await api('/api/properties', { body: { host: 'not a domain' } })).status === 400, 'bad domain rejected');
const whsec = 'whsec_' + randomBytes(24).toString('base64');
check((await api(`/api/properties/${P.id}`, { method: 'PATCH', body: { dodo_secret: whsec } })).data.has_dodo_secret === true, 'save webhook secret (not echoed back)');

console.log('tracking');
const alice = { uid: id(), vsn: id() };
const bob = { uid: id(), vsn: id() };
const carol = { uid: id(), vsn: id() };
const site = P.id;
check((await beacon({ site, kind: 'view', url: 'https://e2e-shop.com/?utm_source=x&utm_campaign=launch', ref: 'https://t.co/abc', ...alice, sw: 1440 })).status === 202, 'pageview accepted');
await beacon({ site, kind: 'view', url: 'https://e2e-shop.com/pricing', ...alice });
await beacon({ site, kind: 'conversion', label: 'checkout_click', meta: { plan: 'pro' }, url: 'https://e2e-shop.com/pricing', ...alice });
await beacon({ site, kind: 'exit', label: 'https://checkout.dodopayments.com/buy/pdt_1', url: 'https://e2e-shop.com/pricing', ...alice });
await beacon({ site, kind: 'beat', ms: 42_000, url: 'https://e2e-shop.com/pricing', ...alice });
await beacon({ site, kind: 'who', meta: { user_id: 'u1', email: 'Alice@Example.com', name: 'Alice' }, url: 'https://e2e-shop.com/pricing', ...alice });
await beacon({ site, kind: 'view', url: 'https://app.e2e-shop.com/blog/post', ref: 'https://www.google.com/', ...bob, sw: 390 });
await beacon({ site, kind: 'view', url: 'https://e2e-shop.com/', ref: 'https://chatgpt.com/', ...carol });
check((await beacon({ site, kind: 'view', url: 'https://evil.com/', ...bob })).status === 403, 'other domains refused');
check((await api('/api/collect', { body: { site, kind: 'view', url: 'https://e2e-shop.com/', ...bob }, headers: { 'user-agent': 'Googlebot/2.1', 'content-type': 'text/plain' } })).status === 202, 'bots silently ignored');
check((await beacon({ site, kind: 'nope', url: 'https://e2e-shop.com/', ...bob })).status === 400, 'invalid beacon rejected');

console.log('revenue');
async function dodo(evt) {
  const raw = JSON.stringify(evt);
  const msgId = 'msg_' + randomBytes(6).toString('hex');
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', Buffer.from(whsec.slice(6), 'base64')).update(`${msgId}.${ts}.${raw}`).digest('base64');
  return api(`/api/hooks/dodo/${P.id}`, { body: raw, headers: { 'webhook-id': msgId, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` } });
}
const pay1 = await dodo({
  type: 'payment.succeeded',
  data: { payment_id: 'pay_alice1', total_amount: 4900, currency: 'USD', customer: { customer_id: 'cus_a', email: 'alice@example.com', name: 'Alice' }, metadata: { tl_uid: alice.uid, tl_vsn: alice.vsn } },
});
check(pay1.status === 200, 'signed Dodo webhook accepted');
check((await api(`/api/hooks/dodo/${P.id}`, { body: '{}', headers: { 'webhook-id': 'x', 'webhook-timestamp': '1', 'webhook-signature': 'v1,x' } })).status === 401, 'unsigned webhook rejected');
// Bob pays without metadata, then lands on the return page.
await dodo({ type: 'payment.succeeded', data: { payment_id: 'pay_bob1', total_amount: 1900, currency: 'USD', customer: { customer_id: 'cus_b', email: 'bob@example.com', name: 'Bob' } } });
await beacon({ site, kind: 'view', url: 'https://e2e-shop.com/thanks?payment_id=pay_bob1&email=bob@example.com', ...bob });
// Alice renews (no metadata) -> linked by earlier charge.
await dodo({ type: 'payment.succeeded', data: { payment_id: 'pay_alice2', total_amount: 4900, currency: 'USD', customer: { customer_id: 'cus_a', email: 'alice@example.com', name: 'Alice' } } });
await dodo({ type: 'refund.succeeded', data: { refund_id: 'ref_1', payment_id: 'pay_alice2', amount: 4900, currency: 'USD', customer: { customer_id: 'cus_a' } } });
// Generic API payment for Carol.
const apiPay = await api('/api/v1/payment', { body: { id: 'txn_1', amount: 9.99, uid: carol.uid, email: 'carol@example.com' }, headers: { authorization: `Bearer ${P.secret_key}` } });
check(apiPay.status === 200 && apiPay.data.linked === true && apiPay.data.via === 'metadata', 'payments API links by uid');
check((await api('/api/v1/payment', { body: { id: 'x', amount: 1 }, headers: { authorization: 'Bearer wrong' } })).status === 401, 'payments API needs key');
const conv = await api('/api/v1/conversion', { body: { uid: carol.uid, name: 'signup_completed' }, headers: { authorization: `Bearer ${P.secret_key}` } });
check(conv.status === 200, 'server-side goal recorded');
// An unattributable payment.
await dodo({ type: 'payment.succeeded', data: { payment_id: 'pay_ghost', total_amount: 500, currency: 'USD', customer: { customer_id: 'cus_g', email: 'ghost@example.com' } } });

console.log('reports');
const q = 'preset=today';
const sum = (await api(`/api/properties/${P.id}/summary?${q}`)).data;
check(sum.now.visitors === 3, `3 visitors (got ${sum.now.visitors})`);
check(sum.now.revenue === 4900 + 1900 + 4900 - 4900 + 999 + 500, `revenue = charges minus refund (got ${sum.now.revenue})`);
check(sum.now.customers === 4, `4 new customers, renewal not counted (got ${sum.now.customers})`);
check(sum.online === 3, `3 online (got ${sum.online})`);
check(sum.series.length >= 1 && sum.series.some((s) => s.visitors > 0), 'chart series filled');

const bd = async (by, f) => (await api(`/api/properties/${P.id}/breakdown?${q}&by=${by}${f ? '&f=' + encodeURIComponent(JSON.stringify(f)) : ''}`)).data;
const sources = await bd('source');
const x = sources.find((r) => r.label === 'X');
check(x && x.visitors === 1 && x.revenue === 4900, `X credited with Alice's 49.00 net (got ${x && x.revenue})`);
check(sources.find((r) => r.label === 'Google')?.revenue === 1900, "Google credited with Bob's return-page payment");
check(sources.find((r) => r.label === 'ChatGPT')?.revenue === 999, 'ChatGPT credited with API payment');
check((await bd('channel')).some((r) => r.label === 'AI'), 'AI channel present');
check((await bd('campaign')).some((r) => r.label === 'launch'), 'campaign breakdown');
check((await bd('device')).some((r) => r.label === 'Mobile'), 'device from screen width');
check((await bd('host_name')).some((r) => r.label === 'app.e2e-shop.com'), 'hostname breakdown');
const pages = await bd('page');
check(pages.find((r) => r.label === '/pricing')?.visitors === 1 && pages.find((r) => r.label === '/')?.visitors === 2, 'page breakdown counts visitors per page');
check((await bd('goal')).some((r) => r.label === 'checkout_click' && r.revenue > 0), 'goal breakdown with revenue');
check((await bd('outbound')).some((r) => r.label?.includes('dodopayments')), 'outbound links');
for (const by of ['referrer', 'keyword', 'utm_source', 'utm_medium', 'utm_content', 'tag', 'country', 'region', 'city', 'browser', 'os', 'landing', 'exit_page']) {
  const rows = await bd(by);
  check(Array.isArray(rows), `breakdown by ${by}`);
}
check((await api(`/api/properties/${P.id}/breakdown?${q}&by=bogus`)).status === 400, 'unknown dimension rejected');

const filtered = (await api(`/api/properties/${P.id}/summary?${q}&f=${encodeURIComponent(JSON.stringify({ source: 'X' }))}`)).data;
check(filtered.now.visitors === 1 && filtered.now.revenue === 4900, 'filter by source narrows visitors and revenue');
const byGoal = (await api(`/api/properties/${P.id}/summary?${q}&f=${encodeURIComponent(JSON.stringify({ goal: 'checkout_click' }))}`)).data;
check(byGoal.now.visitors === 1, 'filter by completed goal');
const byPage = (await api(`/api/properties/${P.id}/summary?${q}&f=${encodeURIComponent(JSON.stringify({ page: '/blog/post' }))}`)).data;
check(byPage.now.visitors === 1, 'filter by visited page');

const buyers = (await api(`/api/properties/${P.id}/buyers?${q}`)).data;
check(buyers.length === 5, `5 charges in journey (got ${buyers.length})`);
const bobRow = buyers.find((r) => r.id === 'pay_bob1');
check(bobRow?.linked_via === 'return_visit' && bobRow.source === 'Google', 'Bob matched via return page');
const renewal = buyers.find((r) => r.id === 'pay_alice2');
check(renewal?.linked_via === 'prior_charge' && renewal.recurring === 1, 'renewal matched via earlier charge');
check(buyers.find((r) => r.id === 'pay_ghost')?.uid === null, 'ghost payment left unattributed');

const relink = (await api(`/api/properties/${P.id}/relink`, { method: 'POST' })).data;
check(relink.checked === 1 && relink.linked === 0 && relink.report[0].note, `relink explains why (${relink.report?.[0]?.note})`);

const ppl = (await api(`/api/properties/${P.id}/people?${q}`)).data;
check(ppl.length === 3, 'people list');
const a = ppl.find((r) => r.uid === alice.uid);
check(a?.email === 'alice@example.com' && a.display_name === 'Alice' && a.engaged_ms === 42000, 'identify + engaged time stored');
const prof = (await api(`/api/properties/${P.id}/people/${alice.uid}`)).data;
check(prof.visits.length === 1 && prof.hits.length === 4 && prof.charges.length === 3, 'visitor profile timeline');
const bobProf = (await api(`/api/properties/${P.id}/people/${bob.uid}`)).data;
check(bobProf.hits.every((h) => !String(h.path).includes('email')), 'private query params never stored');

console.log('funnels');
const fn = await api(`/api/properties/${P.id}/funnels`, { body: { title: 'Buy', steps: [{ kind: 'page', match: '/' }, { kind: 'page', match: '/pri*' }, { kind: 'goal', match: 'checkout_click' }] } });
check(fn.status === 201, 'create funnel');
check((await api(`/api/properties/${P.id}/funnels`, { body: { title: 'x', steps: [] } })).status === 400, 'funnel needs 2 steps');
const rep = (await api(`/api/properties/${P.id}/funnels/${fn.data.id}/report?${q}`)).data;
check(rep[0].people === 2 && rep[1].people === 1 && rep[2].people === 1, `funnel counts 2 → 1 → 1 (got ${rep.map((r) => r.people).join(' → ')})`);
check((await api(`/api/properties/${P.id}/funnels`)).data.length === 1, 'list funnels');
await api(`/api/properties/${P.id}/funnels/${fn.data.id}`, { method: 'DELETE' });

console.log('settings & cleanup');
const rotated = await api(`/api/properties/${P.id}/rotate-key`, { method: 'POST' });
check(rotated.data.secret_key && rotated.data.secret_key !== P.secret_key, 'rotate API key');
check((await api('/api/v1/payment', { body: { id: 'y', amount: 1 }, headers: { authorization: `Bearer ${P.secret_key}` } })).status === 401, 'old key stops working');
check((await api(`/api/properties/${P.id}`, { method: 'PATCH', body: { tz: 'Mars/Base' } })).status === 400, 'bad time zone rejected');
const list = (await api('/api/properties')).data;
check(list.find((p) => p.id === P.id)?.visitors_24h === 3, 'property list shows 24h visitors');
check((await api(`/api/properties/${P.id}`, { method: 'DELETE' })).status === 200, 'delete property');
check((await api(`/api/properties/${P.id}`)).status === 404, 'property gone');
check((await api('/api/session', { method: 'DELETE' })).status === 200, 'log out');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
