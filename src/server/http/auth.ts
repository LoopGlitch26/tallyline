import { constantTimeEqual, issueSessionToken, sessionTokenValid } from '../lib/crypto';
import { cookie, json, readJson, setCookieHeader, type Guard, type Req } from './router';

const COOKIE = 'tallyline_session';
const SESSION_DAYS = 30;
const MAX_WRONG = 10;
const WINDOW_MS = 15 * 60_000;

export async function signedIn(req: Req): Promise<boolean> {
  if (!req.env.COOKIE_SECRET) return false;
  return sessionTokenValid(req.env.COOKIE_SECRET, cookie(req, COOKIE));
}

export const requireLogin: Guard = async (req) => {
  if (!(await signedIn(req))) return json({ error: 'not signed in' }, 401);
};

/** POST /api/session — log in with the dashboard password. */
export async function login(req: Req): Promise<Response> {
  const { DB, DASHBOARD_PASSWORD, COOKIE_SECRET } = req.env;
  if (!DASHBOARD_PASSWORD || !COOKIE_SECRET) {
    return json({ error: 'DASHBOARD_PASSWORD and COOKIE_SECRET are not set. See the README, step 3.' }, 500);
  }
  // Lock an address out after repeated wrong passwords so a public dashboard can't be brute-forced.
  const ip = req.raw.headers.get('cf-connecting-ip') ?? 'local';
  const now = Date.now();
  const recent = await DB.prepare('SELECT COUNT(*) AS n FROM auth_attempts WHERE ip = ?1 AND at > ?2').bind(ip, now - WINDOW_MS).first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_WRONG) return json({ error: 'Too many wrong passwords. Wait 15 minutes and try again.' }, 429);

  const body = await readJson<{ password?: unknown }>(req);
  const given = typeof body?.password === 'string' ? body.password : '';
  if (!given || !constantTimeEqual(given, DASHBOARD_PASSWORD)) {
    await DB.batch([
      DB.prepare('INSERT INTO auth_attempts (ip, at) VALUES (?1, ?2)').bind(ip, now),
      DB.prepare('DELETE FROM auth_attempts WHERE at < ?1').bind(now - WINDOW_MS),
    ]);
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: 'Wrong password' }, 401);
  }
  await DB.prepare('DELETE FROM auth_attempts WHERE ip = ?1').bind(ip).run();
  const token = await issueSessionToken(COOKIE_SECRET, now + SESSION_DAYS * 86_400_000);
  return json(
    { ok: true },
    200,
    { 'set-cookie': setCookieHeader(COOKIE, token, { maxAge: SESSION_DAYS * 86_400, secure: req.url.protocol === 'https:' }) },
  );
}

/** DELETE /api/session */
export function logout(req: Req): Response {
  return json({ ok: true }, 200, { 'set-cookie': setCookieHeader(COOKIE, '', { maxAge: 0, secure: req.url.protocol === 'https:' }) });
}

/** GET /api/session */
export async function whoami(req: Req): Promise<Response> {
  return json({ signedIn: await signedIn(req) });
}
