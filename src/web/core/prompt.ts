import type { Property } from './api';

/**
 * Instructions the site owner pastes into their coding assistant (Claude Code, Cursor, Copilot...).
 * Filled with this property's real values. The API key and webhook secret are left out on purpose:
 * the code changes don't need them.
 */
export function setupPrompt(p: Property, origin: string): string {
  const tag = `<script defer data-site="${p.id}" src="${origin}/t.js"></script>`;
  return `Please wire up Tallyline in this project. Tallyline is my self-hosted web analytics with revenue attribution. Make the changes yourself. If something can't be found by reading the code, collect all your questions and ask them in one message before you start editing.

=== Values (use exactly as written) ===
Tallyline host: ${origin}
Property ID: ${p.id}
Domain: ${p.host} (subdomains like app.${p.host} are the same property)
Revenue currency: ${p.currency}
Snippet: ${tag}

=== Step 1: load the tracker on every page ===
Locate where the HTML <head> is produced (Next.js app/layout.tsx or pages/_document.tsx, index.html for Vite/CRA, the root layout in Astro/Nuxt/SvelteKit/Remix, theme header for WordPress, or static HTML files). Add the snippet once so it runs on all pages, including the signed-in app and any subdomain served from this repo.
- For Next.js use next/script: <Script defer data-site="${p.id}" src="${origin}/t.js" strategy="afterInteractive" />
- Keep the attributes unchanged. Route changes in single-page apps are picked up automatically, so don't add manual page view calls.
- If there is a Content-Security-Policy, add ${origin} to script-src and connect-src.

=== Step 2: send the visitor ids with every Dodo Payments checkout (the important part) ===
The tracker keeps two first-party cookies: tl_uid (the browser) and tl_vsn (the current visit). Each Dodo payment needs them in its metadata so Tallyline can credit the source that produced the sale.
- Find Dodo code: search for "dodopayments", "DodoPayments", "checkoutSessions.create", "payments.create", "subscriptions.create", "checkout.dodopayments.com", "/buy/".
- Server-side creation: read both cookies from the incoming request and ADD them to the metadata, keeping any keys already there:
    metadata: { ...existing, tl_uid: <cookie tl_uid> ?? '', tl_vsn: <cookie tl_vsn> ?? '' }
  Next.js App Router: const jar = await cookies(); jar.get('tl_uid')?.value
- Browser calls to your own API on the same domain already include the cookies. If the API is on another domain, read them in the browser with window.tally?.ids() (returns { tl_uid, tl_vsn }) and pass them along in the request body.
- Plain payment-link anchors (<a href="https://checkout.dodopayments.com/buy/...">) need nothing: the tracker adds metadata_tl_uid / metadata_tl_vsn to them. If code navigates to a payment link from JavaScript, append those two query params yourself using window.tally?.ids().
- Every checkout should return the buyer to a page on ${p.host} that loads the tracker (e.g. return_url: 'https://${p.host}/thanks', or ?redirect_url=... on payment links). Dodo adds ?payment_id=... or ?subscription_id=... to that URL and Tallyline uses it to match the payment to the buyer even if metadata got lost. Don't strip those params before the page loads.
- Leave Dodo webhooks alone in this code. I connect Dodo to Tallyline in the Dodo dashboard (${origin}/api/hooks/dodo/${p.id}).

=== Step 3: identify signed-in users ===
After login or signup succeeds, and on app start when a session already exists, call:
  window.tally?.('identify', { user_id: user.id, email: user.email, name: user.name })

=== Step 4: mark key buttons as goals ===
Add a data-tally attribute with a short snake_case name to the main calls to action (no JavaScript needed):
  <button data-tally="signup_click">   data-tally="start_trial"   data-tally="pricing_cta"   data-tally="checkout_click"
Extra details go in data-tally-* attributes, e.g. data-tally-plan="pro". From code: window.tally?.('event', 'signup_completed', { plan: 'pro' }).
At minimum cover: the main signup/get-started buttons, the plan buttons on the pricing page, the buy/checkout button, and fire 'signup_completed' after a successful signup.

=== TypeScript ===
If the project is TypeScript, add a global type so the calls compile:
  declare global { interface Window { tally?: ((command: 'event' | 'goal' | 'identify' | 'view', a?: unknown, b?: unknown) => void) & { ids?: () => { tl_uid?: string; tl_vsn?: string } } } }
Always call with optional chaining (window.tally?.(...)) so nothing breaks if a blocker removes the script.

=== Ground rules ===
- Keep changes small and in the existing code style. No unrelated refactors.
- No secrets are needed, so don't add any.
- The tracker ignores localhost. To try it locally add data-allow-local to the snippet temporarily and remove it before committing, or test on the live site.

=== Report back with ===
1. Every file you changed, and why.
2. Which checkout paths now send tl_uid / tl_vsn, and any you couldn't find or weren't sure about.
3. The goals you added, and where.
4. How I can check it: open the site, DevTools > Network, a POST to ${origin}/api/collect should return 202 and the visit should show up in Tallyline within seconds.`;
}
