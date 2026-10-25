// Live demo: the real Tallyline Worker runs in this tab against an in-memory SQLite database.
// Every /api/* request the dashboard makes is answered by that Worker instead of the network.
import initSqlJs from 'sql.js/dist/sql-asm-memory-growth.js';
import schema from '../../migrations/0001_schema.sql?raw';
import worker from '../server/main';
import { issueSessionToken } from '../server/lib/crypto';
import { makeD1 } from './d1';
import { DEMO_ID, loadSample } from './sample';
import '../web/style.css';
import './demo.css';

const SECRET = 'demo-cookie-secret';
const status = document.getElementById('boot-status');
const say = (t: string) => status && (status.textContent = t);

async function start() {
  say('Starting the database…');
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.exec(schema);
  say('Generating 60 days of sample traffic…');
  await new Promise((r) => setTimeout(r, 20));
  loadSample(db);

  const env = {
    DB: makeD1(db),
    STATIC: { fetch: async () => new Response('not found', { status: 404 }) },
    DASHBOARD_PASSWORD: 'demo',
    COOKIE_SECRET: SECRET,
  };
  const session = `tallyline_session=${await issueSessionToken(SECRET, Date.now() + 86_400_000)}`;
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
    const req = new Request(url, init);
    // Browsers drop Cookie/User-Agent from constructed requests, so hand the Worker its own headers.
    const headers = new Headers(req.headers);
    headers.set('cookie', session);
    headers.set('user-agent', navigator.userAgent.replace(/Headless/i, ''));
    Object.defineProperty(req, 'headers', { value: headers });
    return worker.fetch(req, env as never, ctx as never);
  };

  if (!location.pathname.startsWith('/p/')) history.replaceState(null, '', `/p/${DEMO_ID}?preset=last30`);
  document.getElementById('boot')?.remove();
  document.body.classList.add('demo-ready');
  await import('../web/main');
  wireSimulator();
}

/** "Send a visit": posts a real beacon, exactly like the tracker script would. */
function wireSimulator() {
  const btn = document.getElementById('sim') as HTMLButtonElement | null;
  const note = document.getElementById('sim-note');
  if (!btn) return;
  const pages = ['/', '/pricing', '/blog/markdown-tips', '/features'];
  const refs = ['https://t.co/x1', 'https://www.google.com/', 'https://chatgpt.com/', 'https://www.reddit.com/r/productivity', ''];
  btn.addEventListener('click', async () => {
    const uid = crypto.randomUUID();
    const vsn = crypto.randomUUID();
    const ref = refs[Math.floor(Math.random() * refs.length)];
    const send = (body: object) =>
      fetch('/api/collect', { method: 'POST', body: JSON.stringify({ site: DEMO_ID, uid, vsn, sw: innerWidth, ...body }), headers: { 'content-type': 'text/plain' } });
    await send({ kind: 'view', url: 'https://inkpad.app/', ref });
    await send({ kind: 'view', url: `https://inkpad.app${pages[1 + Math.floor(Math.random() * 3)]}` });
    if (Math.random() < 0.5) await send({ kind: 'conversion', label: 'checkout_click', url: 'https://inkpad.app/pricing' });
    await send({ kind: 'beat', ms: 30_000 + Math.floor(Math.random() * 90_000), url: 'https://inkpad.app/pricing' });
    const from = ref ? new URL(ref).hostname.replace('www.', '') : 'direct';
    if (note) note.textContent = `Visit from ${from} recorded. Press refresh (↻) to see it.`;
  });
}

start().catch((e) => {
  console.error(e);
  say(`The demo couldn't start: ${(e as Error).message}`);
});
