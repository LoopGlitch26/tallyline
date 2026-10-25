export interface Bindings {
  DB: D1Database;
  STATIC: Fetcher;
  /** Password for the dashboard (`wrangler secret put DASHBOARD_PASSWORD`). */
  DASHBOARD_PASSWORD: string;
  /** Long random string that signs the login cookie (`wrangler secret put COOKIE_SECRET`). */
  COOKIE_SECRET: string;
}

export interface Property {
  id: string;
  label: string;
  host: string;
  tz: string;
  currency: string;
  secret_key: string;
  dodo_secret: string | null;
  created: number;
}

const cache = new Map<string, { value: Property | null; expires: number }>();

/** Properties barely change, so keep them in isolate memory for a minute (saves a read per hit). */
export async function findProperty(db: D1Database, id: string): Promise<Property | null> {
  const hit = cache.get(id);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await db.prepare('SELECT * FROM properties WHERE id = ?1').bind(id).first<Property>();
  cache.set(id, { value, expires: Date.now() + 60_000 });
  return value;
}

export function dropCachedProperty(id: string) {
  cache.delete(id);
}

/** Number of minor units for a currency (USD 2, JPY 0, KWD 3). */
export function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}
