import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { call, type Property } from '../core/api';
import { useCopy } from '../core/hooks';
import { go } from '../core/nav';
import { setupPrompt } from '../core/prompt';
import { Favicon } from '../parts/icons';
import { CodeBlock, Skeleton } from '../parts/ui';

function Block({ n, title, intro, children }: { n?: string; title: string; intro?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="card block">
      <h2>
        {n && <span class="block-no">{n}</span>}
        {title}
      </h2>
      {intro && <p class="muted">{intro}</p>}
      <div class="block-body">{children}</div>
    </section>
  );
}

export function SetupView({ pid }: { pid: string }) {
  const [p, setP] = useState<Property | null>(null);
  const [form, setForm] = useState({ label: '', host: '', tz: '', currency: '' });
  const [secret, setSecret] = useState('');
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const origin = location.origin;

  useEffect(() => {
    call<Property>(`/api/properties/${pid}`).then((x) => {
      setP(x);
      setForm({ label: x.label, host: x.host, tz: x.tz, currency: x.currency });
    });
  }, [pid]);

  const flash = (text: string, bad = false) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), 2200);
  };

  async function save(patch: Record<string, string>, ok = 'Saved') {
    try {
      setP(await call<Property>(`/api/properties/${pid}`, { method: 'PATCH', body: patch }));
      flash(ok);
    } catch (e) {
      flash((e as Error).message, true);
    }
  }

  if (!p) return <div class="page narrow"><Skeleton height={400} /></div>;

  const snippet = `<script defer data-site="${p.id}" src="${origin}/t.js"></script>`;
  const hook = `${origin}/api/hooks/dodo/${p.id}`;

  return (
    <div class="page narrow stack-lg">
      <div class="topbar">
        <button class="btn" onClick={() => go(`/p/${p.id}`)}>
          ← Dashboard
        </button>
        <div class="site-name">
          <Favicon domain={p.host} size={20} /> <b>{p.label}</b>
        </div>
      </div>

      <AiCard property={p} origin={origin} />

      <Block n="1" title="Add the tracker" intro={<>Put this in the <code>&lt;head&gt;</code> of every page on {p.host} and its subdomains.</>}>
        <CodeBlock code={snippet} />
        <details>
          <summary>Next.js</summary>
          <CodeBlock
            code={`// app/layout.tsx
import Script from 'next/script';

<head>
  <Script defer data-site="${p.id}" src="${origin}/t.js" strategy="afterInteractive" />
</head>`}
          />
        </details>
        <details>
          <summary>Serve it from your own domain (fewer ad-block losses)</summary>
          <p class="muted">Some blockers drop requests to analytics hosts. Proxy both the script and the endpoint through your site, then point the tag at them:</p>
          <CodeBlock
            code={`// next.config.js
async rewrites() {
  return [
    { source: '/tl/t.js', destination: '${origin}/t.js' },
    { source: '/tl/collect', destination: '${origin}/api/collect' },
  ];
}

<script defer data-site="${p.id}" data-endpoint="/tl/collect" src="/tl/t.js"></script>`}
          />
        </details>
        <p class="muted small">
          Skip your own visits: open <code>https://{p.host}/?tally_off=1</code> once in each browser you use (<code>?tally_off=0</code> to undo).
        </p>
      </Block>

      <Block n="2" title="Goals and signed-in users" intro="Goals appear under Goals, can be used as funnel steps, and filter the whole dashboard.">
        <CodeBlock
          code={`<!-- A click on any element with data-tally records that goal -->
<button data-tally="signup_click">Start free</button>

<!-- data-tally-* attributes are saved with it -->
<a href="/pricing" data-tally="pricing_click" data-tally-plan="pro">Pricing</a>

<script>
  // From your code
  tally('event', 'signup_completed', { plan: 'pro' });

  // After login: put a name on the visitor
  tally('identify', { user_id: '42', email: 'ana@company.com', name: 'Ana' });
</script>`}
        />
        <p class="muted small">Clicks on links to other websites are recorded automatically (Outbound link tab).</p>
      </Block>

      <Block n="3" title="Revenue from Dodo Payments" intro="Each payment is tied to the visitor who paid and credited to the source that brought them.">
        <ol class="steps">
          <li>
            In Dodo Payments open <b>Developer → Webhooks</b>, add this URL and subscribe to <code>payment.succeeded</code> and <code>refund.succeeded</code>:
            <CodeBlock code={hook} />
          </li>
          <li>
            Paste that webhook's signing secret (starts with <code>whsec_</code>):
            <div class="inline-form">
              <input class="field mono" type="password" placeholder={p.has_dodo_secret ? '•••••••• (saved — paste to replace)' : 'whsec_…'} value={secret} onInput={(e) => setSecret(e.currentTarget.value)} />
              <button
                class="btn primary"
                onClick={async () => {
                  await save({ dodo_secret: secret }, secret ? 'Webhook secret saved' : 'Webhook secret removed');
                  setSecret('');
                }}
              >
                Save
              </button>
            </div>
            {p.has_dodo_secret && <p class="ok small">✓ Secret is set</p>}
          </li>
          <li>
            When you create a checkout, pass the visitor's cookies as metadata. This makes attribution exact:
            <CodeBlock
              code={`import DodoPayments from 'dodopayments';
import { cookies } from 'next/headers';

const dodo = new DodoPayments({ bearerToken: process.env.DODO_PAYMENTS_API_KEY });
const jar = await cookies();

const checkout = await dodo.checkoutSessions.create({
  product_cart: [{ product_id: 'pdt_xxx', quantity: 1 }],
  return_url: 'https://${p.host}/thanks',
  metadata: {
    tl_uid: jar.get('tl_uid')?.value ?? '',
    tl_vsn: jar.get('tl_vsn')?.value ?? '',
  },
});`}
            />
            <p class="muted small">
              Using Dodo payment links (<code>checkout.dodopayments.com/buy/…</code>)? The tracker adds the metadata to those links on the page, but it doesn't
              always survive to the payment, so set the return URL too (next step). In the browser, <code>tally.ids()</code> returns both ids.
            </p>
          </li>
          <li>
            <b>Recommended:</b> set the product's return / redirect URL to a page on your site that loads the tracker, e.g. <code>https://{p.host}/thanks</code>. Dodo
            adds <code>?payment_id=…</code>, which lets Tallyline match the payment to the buyer even without metadata.
          </li>
        </ol>
        <p class="muted small">
          No metadata? Tallyline still tries, in order: the return page, an earlier payment from the same customer (renewals), an email you passed to{' '}
          <code>identify</code>, and finally checkout timing (only when exactly one visitor clicked checkout shortly before). The revenue journey shows how each
          payment was matched. Refunds are subtracted from revenue.
        </p>
      </Block>

      <ApiBlock property={p} origin={origin} onRotated={(k) => setP({ ...p, secret_key: k })} />

      <LinkBuilder host={p.host} />

      <Block title="Website settings">
        <div class="two">
          <label class="lbl">
            Name
            <input class="field" value={form.label} onInput={(e) => setForm({ ...form, label: e.currentTarget.value })} />
          </label>
          <label class="lbl">
            Domain
            <input class="field" value={form.host} onInput={(e) => setForm({ ...form, host: e.currentTarget.value })} />
          </label>
          <label class="lbl">
            Time zone
            <input class="field" value={form.tz} onInput={(e) => setForm({ ...form, tz: e.currentTarget.value })} />
          </label>
          <label class="lbl">
            Revenue currency
            <input class="field" value={form.currency} maxLength={3} onInput={(e) => setForm({ ...form, currency: e.currentTarget.value.toUpperCase() })} />
          </label>
        </div>
        <button class="btn primary" onClick={() => save(form)}>
          Save settings
        </button>
      </Block>

      <Block title="Delete website">
        <p class="muted">Removes the website and every visit, goal and payment recorded for it. This can't be undone.</p>
        <button
          class="btn danger"
          onClick={async () => {
            if (prompt(`Type ${p.host} to confirm`) !== p.host) return;
            await call(`/api/properties/${p.id}`, { method: 'DELETE' });
            go('/');
          }}
        >
          Delete {p.host}
        </button>
      </Block>

      {toast && <div class={`toast${toast.bad ? ' bad' : ''}`}>{toast.text}</div>}
    </div>
  );
}

function AiCard({ property, origin }: { property: Property; origin: string }) {
  const [done, copy] = useCopy();
  const [show, setShow] = useState(false);
  const text = setupPrompt(property, origin);
  return (
    <section class="card ai">
      <div class="ai-head">
        <div>
          <h2>Let your coding assistant set it up</h2>
          <p class="muted">
            Paste this into Claude Code, Cursor or another coding assistant opened in your project. It adds the tracker, sends visitor ids with Dodo checkouts,
            identifies users and marks key buttons as goals, using this website's real values.
          </p>
        </div>
        <button class="btn primary" onClick={() => copy(text)}>
          {done ? 'Copied ✓' : 'Copy prompt'}
        </button>
      </div>
      <button class="link" onClick={() => setShow((s) => !s)}>
        {show ? 'Hide prompt' : 'Read the prompt'}
      </button>
      {show && <pre class="prompt">{text}</pre>}
      <p class="muted small">You still connect the Dodo webhook yourself (step 3), because that happens in Dodo's dashboard.</p>
    </section>
  );
}

function ApiBlock({ property: p, origin, onRotated }: { property: Property; origin: string; onRotated: (key: string) => void }) {
  return (
    <Block title="Other payment providers and server-side goals" intro="Send payments or goals from your backend with this website's API key.">
      <div class="inline-form">
        <input class="field mono" readOnly value={p.secret_key} />
        <button
          class="btn"
          onClick={async () => {
            if (!confirm('Create a new API key? The current key stops working right away.')) return;
            const r = await call<{ secret_key: string }>(`/api/properties/${p.id}/rotate-key`, { method: 'POST' });
            onRotated(r.secret_key);
          }}
        >
          New key
        </button>
      </div>
      <CodeBlock
        code={`# a payment (amount in major units; add "refund": true for refunds)
curl -X POST ${origin}/api/v1/payment \\
  -H "Authorization: Bearer ${p.secret_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"txn_123","amount":29.99,"currency":"${p.currency}","uid":"<tl_uid cookie>","email":"ana@company.com"}'

# a goal
curl -X POST ${origin}/api/v1/conversion \\
  -H "Authorization: Bearer ${p.secret_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"uid":"<tl_uid cookie>","name":"signup_completed"}'`}
      />
    </Block>
  );
}

const CHANNELS = [
  { label: 'X / Twitter', source: 'x', medium: 'social' },
  { label: 'LinkedIn', source: 'linkedin', medium: 'social' },
  { label: 'Reddit', source: 'reddit', medium: 'social' },
  { label: 'YouTube', source: 'youtube', medium: 'video' },
  { label: 'Hacker News', source: 'hackernews', medium: 'social' },
  { label: 'Medium', source: 'medium', medium: 'article' },
  { label: 'Newsletter', source: 'newsletter', medium: 'email' },
  { label: 'Product Hunt', source: 'producthunt', medium: 'referral' },
];

/** Tagged links, so each post shows up by name (Source → Campaign) with the revenue it made. */
function LinkBuilder({ host }: { host: string }) {
  const [page, setPage] = useState(`https://${host}/`);
  const [where, setWhere] = useState(CHANNELS[0].label);
  const [name, setName] = useState('');
  const ch = CHANNELS.find((c) => c.label === where) ?? CHANNELS[0];
  let link = '';
  try {
    const u = new URL(page);
    u.searchParams.set('utm_source', ch.source);
    u.searchParams.set('utm_medium', ch.medium);
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (slug) u.searchParams.set('utm_campaign', slug);
    link = u.href;
  } catch {
    link = '';
  }
  return (
    <Block
      title="Campaign link builder"
      intro="X, LinkedIn, Medium and others hide which exact post sent a visitor. Use a tagged link in each post and it shows up by name under Campaign, with the revenue it brought."
    >
      <label class="lbl">
        Page to link to
        <input class="field" value={page} onInput={(e) => setPage(e.currentTarget.value)} />
      </label>
      <div class="two">
        <label class="lbl">
          Posted on
          <select class="field" value={where} onChange={(e) => setWhere(e.currentTarget.value)}>
            {CHANNELS.map((c) => (
              <option>{c.label}</option>
            ))}
          </select>
        </label>
        <label class="lbl">
          Post name
          <input class="field" placeholder="launch thread, pricing guide…" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
      </div>
      {link && <CodeBlock code={link} />}
      <p class="muted small">
        Short version: <code>?ref=launch-thread</code> also works and shows up as the source.
      </p>
    </Block>
  );
}
