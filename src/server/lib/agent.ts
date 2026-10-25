// User-agent parsing and bot detection. Small on purpose: we only need family names.

export type Device = 'Desktop' | 'Mobile' | 'Tablet';

export interface Agent {
  browser: string;
  os: string;
  device: Device;
}

const BOT_WORDS = [
  'bot', 'crawl', 'spider', 'slurp', 'facebookexternalhit', 'embedly', 'quora link preview', 'whatsapp', 'telegram',
  'discord', 'preview', 'headless', 'phantom', 'puppeteer', 'playwright', 'selenium', 'lighthouse', 'pingdom',
  'uptime', 'monitor', 'curl/', 'wget', 'python', 'axios', 'node-fetch', 'undici', 'go-http', 'java/', 'okhttp',
  'httpclient', 'vercel', 'chatgpt-user', 'gptbot', 'claudebot', 'claude-web', 'perplexitybot', 'bytespider',
  'ahrefs', 'semrush', 'mj12', 'dotbot', 'petalbot', 'scrapy',
];

export function looksLikeBot(ua: string): boolean {
  if (!ua) return true;
  const s = ua.toLowerCase();
  return BOT_WORDS.some((w) => s.includes(w));
}

// Checked top to bottom: in-app browsers and Chromium forks must come before Chrome, Chrome before Safari.
const BROWSER_RULES: [string, RegExp][] = [
  ['Instagram', /Instagram/i],
  ['Facebook', /FBAN|FBAV|FB_IAB/],
  ['X', /Twitter/i],
  ['LinkedIn', /LinkedInApp/],
  ['Threads', /Barcelona|Threads/],
  ['TikTok', /TikTok|musical_ly|BytedanceWebview/i],
  ['Edge', /Edg(?:e|A|iOS)?\//],
  ['Opera', /OPR\/|Opera|OPiOS/],
  ['Samsung Internet', /SamsungBrowser/],
  ['Yandex', /YaBrowser/],
  ['Vivaldi', /Vivaldi/],
  ['Brave', /Brave/],
  ['DuckDuckGo', /DuckDuckGo|Ddg\//],
  ['Arc', /\bArc\//],
  ['Firefox', /Firefox|FxiOS/],
  ['Android WebView', /; wv\)/],
  ['Chrome', /Chrome|CriOS/],
  ['Mobile Safari', /Mobile\/\S+ Safari|Version\/[\d.]+ Mobile/],
  ['Safari', /Safari/],
];

const OS_RULES: [string, RegExp][] = [
  ['iOS', /iPhone|iPod/],
  ['iPadOS', /iPad/],
  ['Android', /Android/],
  ['Windows', /Windows/],
  ['ChromeOS', /CrOS/],
  ['macOS', /Macintosh|Mac OS X/],
  ['Linux', /Linux|X11/],
];

export function parseAgent(ua: string, screenWidth?: number): Agent {
  const browser = BROWSER_RULES.find(([, re]) => re.test(ua))?.[0] ?? 'Other';
  const os = OS_RULES.find(([, re]) => re.test(ua))?.[0] ?? 'Other';
  let device: Device;
  if (/iPad|Tablet|PlayBook|Silk/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) device = 'Tablet';
  else if (/Mobi|iPhone|iPod|Android|Opera Mini/.test(ua)) device = 'Mobile';
  else device = screenWidth && screenWidth < 600 ? 'Mobile' : 'Desktop';
  return { browser, os, device };
}
