import { describe, expect, it } from 'vitest';
import { classifyTraffic, lookupSource } from '../src/common/sources';
import { normalizeDomain } from '../src/server/http/properties';
import { arrivalFrom, isOwnHost, tidyPath } from '../src/server/ingest/collect';
import { looksLikeBot, parseAgent } from '../src/server/lib/agent';
import { checkStandardWebhook, hmacSha256, issueSessionToken, sessionTokenValid, toBase64 } from '../src/server/lib/crypto';
import { bucketKeys, dayStart, localMidnight, resolvePeriod, zoneOffset } from '../src/server/lib/period';
import { parseFilters, filterClause } from '../src/server/reports/dimensions';
import { cleanSteps, stepMatcher } from '../src/server/reports/reports';

describe('traffic classification', () => {
  it('maps referrer hosts to known sources', () => {
    expect(classifyTraffic({ refHost: 't.co' })).toEqual({ source: 'X', channel: 'Social' });
    expect(classifyTraffic({ refHost: 'google.co.uk' })).toEqual({ source: 'Google', channel: 'Search' });
    expect(classifyTraffic({ refHost: 'chatgpt.com' })).toEqual({ source: 'ChatGPT', channel: 'AI' });
    expect(classifyTraffic({ refHost: 'news.ycombinator.com' })).toEqual({ source: 'Hacker News', channel: 'Social' });
  });
  it('does not match look-alike domains', () => {
    expect(lookupSource('mygoogle.com')).toBeUndefined();
    expect(lookupSource('notreddit.com')).toBeUndefined();
  });
  it('prefers a recognised tag, then a recognised referrer, then the raw tag', () => {
    expect(classifyTraffic({ refHost: 'google.com', tag: 'launch-thread' }).source).toBe('Google');
    expect(classifyTraffic({ refHost: 'someblog.dev', tag: 'launch-thread' }).source).toBe('launch-thread');
    expect(classifyTraffic({ refHost: 't.co', utmSource: 'newsletter' })).toEqual({ source: 'Newsletter', channel: 'Email' });
  });
  it('uses utm_medium for paid and email', () => {
    expect(classifyTraffic({ refHost: null, utmSource: 'google', utmMedium: 'cpc' }).channel).toBe('Paid');
    expect(classifyTraffic({ refHost: null, utmSource: 'acme', utmMedium: 'email' }).channel).toBe('Email');
    expect(classifyTraffic({ refHost: null, utmSource: 'acme', utmMedium: 'social' }).channel).toBe('Social');
  });
  it('falls back to referral and direct', () => {
    expect(classifyTraffic({ refHost: 'someblog.dev' })).toEqual({ source: 'someblog.dev', channel: 'Referral' });
    expect(classifyTraffic({ refHost: null })).toEqual({ source: 'Direct', channel: 'Direct' });
  });
});

describe('ingest helpers', () => {
  it('treats subdomains as the same site', () => {
    expect(isOwnHost('app.example.com', 'example.com')).toBe(true);
    expect(isOwnHost('www.example.com', 'example.com')).toBe(true);
    expect(isOwnHost('badexample.com', 'example.com')).toBe(false);
  });
  it('tidies paths', () => {
    expect(tidyPath('/blog/')).toBe('/blog');
    expect(tidyPath('/')).toBe('/');
    expect(tidyPath('/caf%C3%A9')).toBe('/café');
  });
  it('ignores self-referrals and reads utm/ref', () => {
    const a = arrivalFrom(new URL('https://example.com/?utm_campaign=launch&ref=hn'), 'https://blog.example.com/x', 'example.com');
    expect(a.refHost).toBeNull();
    expect(a.utm.campaign).toBe('launch');
    expect(a.tag).toBe('hn');
    expect(a.source).toBe('Hacker News');
  });
  it('reads android app referrers', () => {
    expect(arrivalFrom(new URL('https://example.com/'), 'android-app://com.google.android.gm', 'example.com').refHost).toBe('com.google.android.gm');
  });
  it('normalizes domains', () => {
    expect(normalizeDomain('https://www.Example.com/path?x')).toBe('example.com');
    expect(normalizeDomain('shop.example.co.uk:8080')).toBe('shop.example.co.uk');
  });
});

describe('user agents', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const chromeMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
  const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0';
  it('parses common browsers', () => {
    expect(parseAgent(iphone)).toEqual({ browser: 'Mobile Safari', os: 'iOS', device: 'Mobile' });
    expect(parseAgent(chromeMac)).toEqual({ browser: 'Chrome', os: 'macOS', device: 'Desktop' });
    expect(parseAgent(edge).browser).toBe('Edge');
  });
  it('uses screen width as a hint', () => {
    expect(parseAgent(chromeMac, 390).device).toBe('Mobile');
  });
  it('spots bots', () => {
    expect(looksLikeBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(looksLikeBot('curl/8.1')).toBe(true);
    expect(looksLikeBot('')).toBe(true);
    expect(looksLikeBot(chromeMac)).toBe(false);
  });
});

describe('time windows', () => {
  const DAY = 86_400_000;
  it('computes zone offsets', () => {
    expect(zoneOffset('Asia/Kolkata', Date.UTC(2026, 0, 1))).toBe(5.5 * 3_600_000);
    expect(zoneOffset('UTC')).toBe(0);
    expect(zoneOffset('Not/AZone')).toBe(0);
  });
  it('finds local midnight', () => {
    const at = Date.UTC(2026, 5, 10, 20, 0); // 01:30 on Jun 11 in Kolkata
    expect(new Date(localMidnight(at, 'Asia/Kolkata')).toISOString()).toBe('2026-06-10T18:30:00.000Z');
    expect(dayStart('2026-06-11', 'Asia/Kolkata')).toBe(Date.UTC(2026, 5, 10, 18, 30));
  });
  it('resolves presets and picks a step', () => {
    const now = Date.UTC(2026, 9, 25, 12);
    const p = resolvePeriod({ preset: 'last7' }, 'UTC', 0, now);
    expect(p.start).toBe(Date.UTC(2026, 9, 19));
    expect(p.step).toBe('day');
    expect(resolvePeriod({ preset: 'today' }, 'UTC', 0, now).step).toBe('hour');
    expect(resolvePeriod({ preset: 'last365' }, 'UTC', 0, now).step).toBe('week');
    expect(resolvePeriod({ preset: 'last90', step: 'hour' }, 'UTC', 0, now).step).toBe('day');
  });
  it('handles a custom range that includes the last day', () => {
    const now = Date.UTC(2026, 9, 25, 12);
    const p = resolvePeriod({ preset: 'range', from: '2026-10-01', to: '2026-10-03' }, 'UTC', 0, now);
    expect(p.start).toBe(Date.UTC(2026, 9, 1));
    expect(p.end).toBe(Date.UTC(2026, 9, 4));
  });
  it('lists buckets without gaps, Monday-based weeks', () => {
    expect(bucketKeys({ start: Date.UTC(2026, 9, 1), end: Date.UTC(2026, 9, 4), step: 'day' }, 0)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    // 2026-10-25 is a Sunday; its week starts Monday 2026-10-19.
    expect(bucketKeys({ start: Date.UTC(2026, 9, 25), end: Date.UTC(2026, 9, 25) + DAY, step: 'week' }, 0)).toEqual(['2026-10-19']);
    expect(bucketKeys({ start: Date.UTC(2026, 9, 26), end: Date.UTC(2026, 9, 26) + DAY, step: 'week' }, 0)).toEqual(['2026-10-26']);
  });
});

describe('security', () => {
  it('verifies Standard Webhooks signatures', async () => {
    const key = crypto.getRandomValues(new Uint8Array(24));
    const secret = 'whsec_' + toBase64(key);
    const now = 1_760_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const body = '{"type":"payment.succeeded"}';
    const sig = toBase64(await hmacSha256(key, `msg_1.${ts}.${body}`));
    const headers = { id: 'msg_1', timestamp: ts, signature: `v1,bogus v1,${sig}` };
    expect(await checkStandardWebhook(secret, headers, body, now)).toBe(true);
    expect(await checkStandardWebhook(secret, headers, body + ' ', now)).toBe(false);
    expect(await checkStandardWebhook(secret, headers, body, now + 10 * 60_000)).toBe(false);
  });
  it('signs and checks session tokens', async () => {
    const t = await issueSessionToken('s3cret', Date.now() + 60_000);
    expect(await sessionTokenValid('s3cret', t)).toBe(true);
    expect(await sessionTokenValid('other', t)).toBe(false);
    expect(await sessionTokenValid('s3cret', t.replace(/^\d/, '9'))).toBe(false);
    expect(await sessionTokenValid('s3cret', await issueSessionToken('s3cret', Date.now() - 1))).toBe(false);
  });
});

describe('filters and funnels', () => {
  it('keeps only known filterable dimensions', () => {
    expect(parseFilters('{"source":"X","outbound":"x","nope":"y","country":"IN"}')).toEqual({ source: 'X', country: 'IN' });
    expect(parseFilters('not json')).toEqual({});
  });
  it('builds filter SQL with null for empty values', () => {
    const f = filterClause({ source: 'X', campaign: '', goal: 'signup' });
    expect(f.sql).toContain('v.source = ?');
    expect(f.sql).toContain('v.utm_campaign IS NULL');
    expect(f.sql).toContain("fh.kind = 'conversion'");
    expect(f.args).toEqual(['X', 'signup']);
  });
  it('matches funnel steps with wildcards', () => {
    const page = stepMatcher({ kind: 'page', match: '/blog/*' });
    expect(page({ kind: 'view', label: null, path: '/blog/hello' })).toBe(true);
    expect(page({ kind: 'view', label: null, path: '/blogs' })).toBe(false);
    const goal = stepMatcher({ kind: 'goal', match: 'signup' });
    expect(goal({ kind: 'conversion', label: 'signup', path: '/' })).toBe(true);
    expect(cleanSteps([{ kind: 'page', match: ' /x ' }, { kind: 'bad', match: 'y' }, { kind: 'goal', match: '' }])).toEqual([{ kind: 'page', match: '/x' }]);
  });
});
