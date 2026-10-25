// Traffic source catalogue. Used by the server (classifying visits) and the dashboard (icons).

export type Channel = 'Direct' | 'Search' | 'Social' | 'AI' | 'Referral' | 'Email' | 'Paid';

export const CHANNELS: Channel[] = ['Direct', 'Search', 'Social', 'AI', 'Referral', 'Email', 'Paid'];

interface Entry {
  /** Display name. */
  name: string;
  /** Domain used for the favicon. */
  icon: string;
  channel: Channel;
  /** Referrer hosts. A host matches if it equals one of these or is a subdomain of it. */
  hosts: string[];
  /** Hosts matched with any country TLD, e.g. "google" matches google.de and google.co.uk. */
  anyTld?: string[];
  /** Values of utm_source / ?ref= that mean this source. */
  tags: string[];
}

const CATALOGUE: Entry[] = [
  // search
  { name: 'Google', icon: 'google.com', channel: 'Search', hosts: [], anyTld: ['google'], tags: ['google'] },
  { name: 'Bing', icon: 'bing.com', channel: 'Search', hosts: ['bing.com'], tags: ['bing'] },
  { name: 'DuckDuckGo', icon: 'duckduckgo.com', channel: 'Search', hosts: ['duckduckgo.com'], tags: ['duckduckgo', 'ddg'] },
  { name: 'Yahoo', icon: 'yahoo.com', channel: 'Search', hosts: [], anyTld: ['yahoo'], tags: ['yahoo'] },
  { name: 'Yandex', icon: 'yandex.com', channel: 'Search', hosts: [], anyTld: ['yandex'], tags: ['yandex'] },
  { name: 'Baidu', icon: 'baidu.com', channel: 'Search', hosts: ['baidu.com'], tags: ['baidu'] },
  { name: 'Ecosia', icon: 'ecosia.org', channel: 'Search', hosts: ['ecosia.org'], tags: ['ecosia'] },
  { name: 'Brave Search', icon: 'search.brave.com', channel: 'Search', hosts: ['search.brave.com'], tags: ['brave'] },
  { name: 'Kagi', icon: 'kagi.com', channel: 'Search', hosts: ['kagi.com'], tags: ['kagi'] },
  // AI assistants
  { name: 'ChatGPT', icon: 'chatgpt.com', channel: 'AI', hosts: ['chatgpt.com', 'chat.openai.com', 'openai.com'], tags: ['chatgpt', 'chatgpt.com', 'openai'] },
  { name: 'Claude', icon: 'claude.ai', channel: 'AI', hosts: ['claude.ai'], tags: ['claude', 'claude.ai'] },
  { name: 'Perplexity', icon: 'perplexity.ai', channel: 'AI', hosts: ['perplexity.ai'], tags: ['perplexity'] },
  { name: 'Gemini', icon: 'gemini.google.com', channel: 'AI', hosts: ['gemini.google.com', 'bard.google.com'], tags: ['gemini'] },
  { name: 'Copilot', icon: 'copilot.microsoft.com', channel: 'AI', hosts: ['copilot.microsoft.com'], tags: ['copilot'] },
  { name: 'DeepSeek', icon: 'deepseek.com', channel: 'AI', hosts: ['deepseek.com'], tags: ['deepseek'] },
  { name: 'Grok', icon: 'grok.com', channel: 'AI', hosts: ['grok.com'], tags: ['grok'] },
  { name: 'Mistral', icon: 'mistral.ai', channel: 'AI', hosts: ['chat.mistral.ai'], tags: ['mistral', 'lechat'] },
  // social
  { name: 'X', icon: 'x.com', channel: 'Social', hosts: ['t.co', 'x.com', 'twitter.com'], tags: ['x', 'twitter', 'tw'] },
  { name: 'YouTube', icon: 'youtube.com', channel: 'Social', hosts: ['youtube.com', 'youtu.be'], tags: ['youtube', 'yt'] },
  { name: 'LinkedIn', icon: 'linkedin.com', channel: 'Social', hosts: ['linkedin.com', 'lnkd.in'], tags: ['linkedin'] },
  { name: 'Reddit', icon: 'reddit.com', channel: 'Social', hosts: ['reddit.com', 'redd.it'], tags: ['reddit'] },
  { name: 'Facebook', icon: 'facebook.com', channel: 'Social', hosts: ['facebook.com', 'fb.com', 'fb.me'], tags: ['facebook', 'fb'] },
  { name: 'Instagram', icon: 'instagram.com', channel: 'Social', hosts: ['instagram.com'], tags: ['instagram', 'ig'] },
  { name: 'Threads', icon: 'threads.net', channel: 'Social', hosts: ['threads.net', 'threads.com'], tags: ['threads'] },
  { name: 'TikTok', icon: 'tiktok.com', channel: 'Social', hosts: ['tiktok.com'], tags: ['tiktok'] },
  { name: 'Pinterest', icon: 'pinterest.com', channel: 'Social', hosts: [], anyTld: ['pinterest'], tags: ['pinterest'] },
  { name: 'Bluesky', icon: 'bsky.app', channel: 'Social', hosts: ['bsky.app'], tags: ['bluesky', 'bsky'] },
  { name: 'Mastodon', icon: 'joinmastodon.org', channel: 'Social', hosts: [], anyTld: ['mastodon'], tags: ['mastodon'] },
  { name: 'Hacker News', icon: 'news.ycombinator.com', channel: 'Social', hosts: ['news.ycombinator.com'], tags: ['hackernews', 'hn'] },
  { name: 'Discord', icon: 'discord.com', channel: 'Social', hosts: ['discord.com'], tags: ['discord'] },
  // referral communities
  { name: 'Product Hunt', icon: 'producthunt.com', channel: 'Referral', hosts: ['producthunt.com'], tags: ['producthunt', 'ph'] },
  { name: 'Medium', icon: 'medium.com', channel: 'Referral', hosts: ['medium.com'], tags: ['medium'] },
  { name: 'Substack', icon: 'substack.com', channel: 'Referral', hosts: ['substack.com'], tags: ['substack'] },
  { name: 'Dev.to', icon: 'dev.to', channel: 'Referral', hosts: ['dev.to'], tags: ['devto', 'dev.to'] },
  { name: 'Indie Hackers', icon: 'indiehackers.com', channel: 'Referral', hosts: ['indiehackers.com'], tags: ['indiehackers'] },
  { name: 'GitHub', icon: 'github.com', channel: 'Referral', hosts: ['github.com'], tags: ['github'] },
  // email
  { name: 'Gmail', icon: 'mail.google.com', channel: 'Email', hosts: ['mail.google.com'], tags: ['gmail'] },
  { name: 'Outlook', icon: 'outlook.com', channel: 'Email', hosts: ['outlook.com', 'outlook.live.com', 'outlook.office.com'], tags: ['outlook'] },
  { name: 'Newsletter', icon: '', channel: 'Email', hosts: [], tags: ['newsletter', 'email', 'mail'] },
];

const MEDIUM_CHANNEL: [Set<string>, Channel][] = [
  [new Set(['cpc', 'ppc', 'cpm', 'paid', 'paid_social', 'paid-social', 'paidsocial', 'paidsearch', 'paid_search', 'ad', 'ads', 'display', 'retargeting', 'sponsored']), 'Paid'],
  [new Set(['email', 'e-mail', 'newsletter']), 'Email'],
];
const SOCIAL_MEDIUMS = new Set(['social', 'social_media', 'social-media', 'sm']);

function hostMatches(entry: Entry, host: string): boolean {
  if (entry.hosts.some((h) => host === h || host.endsWith('.' + h))) return true;
  if (entry.anyTld) {
    const labels = host.split('.');
    // google.com, www.google.co.uk, images.google.de ... but not mygoogle.com
    return entry.anyTld.some((brand) => {
      const i = labels.indexOf(brand);
      return i >= 0 && i < labels.length - 1 && labels.slice(i + 1).every((l) => /^[a-z]{2,3}$/.test(l));
    });
  }
  return false;
}

/** Find a catalogue entry for a referrer host or a tag (utm_source / ref). */
export function lookupSource(value: string | null | undefined): Entry | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase().replace(/^www\./, '');
  if (!v) return undefined;
  return CATALOGUE.find((e) => e.tags.includes(v) || hostMatches(e, v));
}

/** Favicon domain for a source name shown in the dashboard. */
export function iconForSource(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  return CATALOGUE.find((e) => e.name === name)?.icon || undefined;
}

export interface SourceVerdict {
  source: string;
  channel: Channel;
}

export const DIRECT_SOURCE = 'Direct';

/**
 * Decide where a visit came from. Order of preference for the source name:
 * a recognised tag (utm_source / ?ref=), a recognised referrer, the raw tag, the raw referrer host.
 * The tag itself is always kept on the visit too (Campaign / Ref tag tabs), so a specific post stays visible.
 * utm_medium decides Paid / Email first.
 */
export function classifyTraffic(input: {
  refHost: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  tag?: string | null;
}): SourceVerdict {
  const tagged = input.utmSource || input.tag || null;
  const entry = lookupSource(tagged) ?? lookupSource(input.refHost);
  const medium = input.utmMedium?.trim().toLowerCase() ?? '';

  const source = entry?.name ?? tagged ?? input.refHost ?? DIRECT_SOURCE;

  let channel: Channel | undefined;
  for (const [set, ch] of MEDIUM_CHANNEL) if (medium && set.has(medium)) channel = ch;
  if (!channel && entry) channel = entry.channel;
  if (!channel && medium && SOCIAL_MEDIUMS.has(medium)) channel = 'Social';
  if (!channel) channel = tagged || input.refHost ? 'Referral' : 'Direct';

  return { source, channel };
}
