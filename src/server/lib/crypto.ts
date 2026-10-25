const utf8 = new TextEncoder();
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random lowercase alphanumeric id. */
export function newId(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const toUrlSafe = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function hmacSha256(key: Uint8Array | string, message: string): Promise<ArrayBuffer> {
  const raw = typeof key === 'string' ? utf8.encode(key) : key;
  const k = await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, utf8.encode(message));
}

/** Compare two strings without leaking where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Session cookie: "<expiresAtMs>.<sig>". */
export async function issueSessionToken(secret: string, expiresAt: number): Promise<string> {
  const payload = String(expiresAt);
  return `${payload}.${toUrlSafe(toBase64(await hmacSha256(secret, 'tallyline-session:' + payload)))}`;
}

export async function sessionTokenValid(secret: string, token: string | null, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expiresAt = Number(token.slice(0, dot));
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
  const expected = await issueSessionToken(secret, expiresAt);
  return constantTimeEqual(expected, token);
}

/**
 * Standard Webhooks signature check (the scheme Dodo Payments uses).
 * Signed string: "<webhook-id>.<webhook-timestamp>.<raw body>", key = base64 part of "whsec_...".
 * The signature header can hold several space-separated "v1,<base64>" entries.
 */
export async function checkStandardWebhook(
  secret: string,
  h: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  now = Date.now(),
  toleranceSec = 300,
): Promise<boolean> {
  if (!h.id || !h.timestamp || !h.signature) return false;
  const sent = Number(h.timestamp);
  if (!Number.isFinite(sent) || Math.abs(now / 1000 - sent) > toleranceSec) return false;
  let key: Uint8Array;
  try {
    key = fromBase64(secret.replace(/^whsec_/, ''));
  } catch {
    return false;
  }
  const want = toBase64(await hmacSha256(key, `${h.id}.${h.timestamp}.${rawBody}`));
  for (const part of h.signature.split(' ')) {
    const [, sig] = part.split(',');
    if (sig && constantTimeEqual(sig, want)) return true;
  }
  return false;
}
