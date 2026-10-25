import { useEffect, useState } from 'preact/hooks';
import { call, type Property } from '../core/api';
import { num } from '../core/format';
import { go } from '../core/nav';
import { Favicon } from '../parts/icons';
import { Dialog } from '../parts/ui';
import { Wordmark } from './wordmark';

export function PropertiesView() {
  const [list, setList] = useState<Property[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    call<Property[]>('/api/properties').then((l) => {
      setList(l);
      if (!l.length) setAdding(true);
    });
  }, []);

  return (
    <div class="page narrow">
      <div class="list-head">
        <Wordmark />
        <div class="row-actions">
          <button
            class="btn"
            onClick={async () => {
              await call('/api/session', { method: 'DELETE' });
              dispatchEvent(new Event('tallyline:signed-out'));
            }}
          >
            Sign out
          </button>
          <button class="btn primary" onClick={() => setAdding(true)}>
            Add website
          </button>
        </div>
      </div>

      <div class="site-grid">
        {list?.map((p) => (
          <button class="card site" onClick={() => go(`/p/${p.id}`)}>
            <div class="site-name">
              <Favicon domain={p.host} size={22} />
              <div>
                <div class="strong">{p.label}</div>
                <div class="muted small">{p.host}</div>
              </div>
            </div>
            <div class="site-stats">
              <span>
                <b>{num(p.visitors_24h ?? 0)}</b> visitors · 24h
              </span>
              <span>
                <i class="live" /> {p.online ?? 0} online
              </span>
            </div>
          </button>
        ))}
      </div>
      {list && !list.length && !adding && <p class="muted center">Add your first website to get a tracking snippet.</p>}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add a website">
        <AddForm onCreated={(p) => go(`/p/${p.id}/setup`)} />
      </Dialog>
    </div>
  );
}

function AddForm({ onCreated }: { onCreated: (p: Property) => void }) {
  const [host, setHost] = useState('');
  const [label, setLabel] = useState('');
  const [tz, setTz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState('');
  return (
    <form
      class="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        try {
          onCreated(await call<Property>('/api/properties', { body: { host, label, tz, currency } }));
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label class="lbl">
        Domain
        <input class="field" placeholder="example.com" value={host} onInput={(e) => setHost(e.currentTarget.value)} autoFocus required />
      </label>
      <label class="lbl">
        Name <span class="muted">(optional)</span>
        <input class="field" placeholder="My product" value={label} onInput={(e) => setLabel(e.currentTarget.value)} />
      </label>
      <div class="two">
        <label class="lbl">
          Time zone
          <input class="field" value={tz} onInput={(e) => setTz(e.currentTarget.value)} />
        </label>
        <label class="lbl">
          Revenue currency
          <input class="field" value={currency} maxLength={3} onInput={(e) => setCurrency(e.currentTarget.value.toUpperCase())} />
        </label>
      </div>
      <p class="muted small">Subdomains (app.example.com, blog.example.com) are counted as part of the same website.</p>
      <button class="btn primary wide">Create</button>
      {error && <p class="error">{error}</p>}
    </form>
  );
}
