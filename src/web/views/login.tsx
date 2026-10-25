import { useState } from 'preact/hooks';
import { call } from '../core/api';
import { Wordmark } from './wordmark';

export function LoginView({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div class="login">
      <form
        class="card login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await call('/api/session', { body: { password } });
            onDone();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Wordmark />
        <p class="muted">Enter your dashboard password.</p>
        <input class="field" type="password" autoFocus autoComplete="current-password" value={password} onInput={(e) => setPassword(e.currentTarget.value)} placeholder="Password" />
        <button class="btn primary wide" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <p class="error">{error}</p>}
      </form>
    </div>
  );
}
