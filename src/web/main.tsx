import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { call } from './core/api';
import { usePath } from './core/nav';
import { BoardView } from './views/board';
import { LoginView } from './views/login';
import { PropertiesView } from './views/properties';
import { SetupView } from './views/setup';
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

  const setup = /^\/p\/([\w-]+)\/setup\/?$/.exec(path);
  if (setup) return <SetupView key={setup[1]} pid={setup[1]} />;
  const board = /^\/p\/([\w-]+)\/?$/.exec(path);
  if (board) return <BoardView key={board[1]} pid={board[1]} />;
  return <PropertiesView />;
}

render(<App />, document.getElementById('app')!);
