// A very small path router for the Worker. Patterns look like "/api/properties/:pid/funnels/:fid".

import type { Bindings } from '../types';

export interface Req {
  raw: Request;
  url: URL;
  env: Bindings;
  ctx: ExecutionContext;
  params: Record<string, string>;
  /** Values set by guards (e.g. the loaded property). */
  locals: Record<string, unknown>;
}

export type Handler = (req: Req) => Promise<Response> | Response;
/** A guard returns a Response to stop the chain, or nothing to continue. */
export type Guard = (req: Req) => Promise<Response | void> | Response | void;

interface Route {
  method: string;
  parts: string[];
  guards: Guard[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  on(method: string, pattern: string, ...chain: [...Guard[], Handler]) {
    const handler = chain.pop() as Handler;
    this.routes.push({ method, parts: pattern.split('/').filter(Boolean), guards: chain as Guard[], handler });
    return this;
  }

  get(p: string, ...c: [...Guard[], Handler]) {
    return this.on('GET', p, ...c);
  }
  post(p: string, ...c: [...Guard[], Handler]) {
    return this.on('POST', p, ...c);
  }
  patch(p: string, ...c: [...Guard[], Handler]) {
    return this.on('PATCH', p, ...c);
  }
  delete(p: string, ...c: [...Guard[], Handler]) {
    return this.on('DELETE', p, ...c);
  }

  async handle(raw: Request, env: Bindings, ctx: ExecutionContext): Promise<Response | null> {
    const url = new URL(raw.url);
    const segs = url.pathname.split('/').filter(Boolean);
    let pathMatched = false;
    for (const r of this.routes) {
      const params = match(r.parts, segs);
      if (!params) continue;
      pathMatched = true;
      if (r.method !== raw.method && !(r.method === 'GET' && raw.method === 'HEAD')) continue;
      const req: Req = { raw, url, env, ctx, params, locals: {} };
      for (const g of r.guards) {
        const stop = await g(req);
        if (stop) return stop;
      }
      return r.handler(req);
    }
    return pathMatched ? json({ error: 'method not allowed' }, 405) : null;
  }
}

function match(pattern: string[], segs: string[]): Record<string, string> | null {
  if (pattern.length !== segs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p.startsWith(':')) {
      try {
        params[p.slice(1)] = decodeURIComponent(segs[i]);
      } catch {
        return null;
      }
    } else if (p !== segs[i]) return null;
  }
  return params;
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function empty(status: number, headers: HeadersInit = {}): Response {
  return new Response(null, { status, headers });
}

/** Parse a JSON body; returns null when missing or invalid. */
export async function readJson<T = Record<string, unknown>>(req: Req): Promise<T | null> {
  try {
    const v = await req.raw.json();
    return v && typeof v === 'object' ? (v as T) : null;
  } catch {
    return null;
  }
}

export function cookie(req: Req, name: string): string | null {
  const header = req.raw.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function setCookieHeader(
  name: string,
  value: string,
  opts: { maxAge: number; secure: boolean; httpOnly?: boolean },
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${opts.maxAge}`,
    'SameSite=Lax',
    opts.httpOnly !== false ? 'HttpOnly' : '',
    opts.secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/** Short trimmed string or null. */
export function text(v: unknown, max = 255): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
