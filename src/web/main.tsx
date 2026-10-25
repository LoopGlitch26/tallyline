import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { call } from './core/api';
import { usePath } from './core/nav';
import { LoginView } from './views/login';
import { PropertiesView } from './views/properties';
import { Workspace } from './views/workspace';
import type { Section } from './core/board';
import './style.css';

function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const path = usePath();

  useEffect(() => {
    call<{ signedIn: boolean }>('/api/session')
      .then((r) => setSignedIn(r.signedIn))
      .catch(() => setSignedIn(false));
    const out = () => setSignedIn(false);
    addEventListener('tallyline:signed-out', out);
    return () => removeEventListener('tallyline:signed-out', out);
  }, []);

  if (signedIn === null) return null;
  if (!signedIn) return <LoginView onDone={() => setSignedIn(true)} />;

  const m = /^\/p\/([\w-]+)(?:\/(overview|acquisition|behavior|revenue|people|funnels|setup))?\/?$/.exec(path);
  if (m) return <Workspace key={m[1]} pid={m[1]} section={(m[2] as Section) ?? 'overview'} />;
  return <PropertiesView />;
}

render(<App />, document.getElementById('app')!);
