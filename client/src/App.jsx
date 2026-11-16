import { useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './Login.jsx';
import DocList from './DocList.jsx';
import Editor from './Editor.jsx';
import Logo from './Logo.jsx';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking session
  const [hash, setHash] = useState(location.hash);

  useEffect(() => {
    api('/me').then(setUser, () => setUser(null));
    const onHash = () => setHash(location.hash);
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  if (user === undefined) return <p className="center muted">Loading…</p>;
  if (!user) return <Login onLogin={setUser} />;

  const docId = hash.match(/^#\/doc\/(\d+)$/)?.[1];
  const signOut = async () => {
    await api('/logout', { method: 'POST' });
    location.hash = '';
    setUser(null);
  };

  return (
    <>
      <header className="topbar">
        <a href="#/" className="brand" aria-label="AJDocs home"><Logo /></a>
        <span>
          Signed in as <strong>{user.name}</strong>{' '}
          <button onClick={signOut}>Sign out</button>
        </span>
      </header>
      <main className={docId ? 'wide' : ''}>{docId ? <Editor key={docId} id={docId} me={user} /> : <DocList />}</main>
    </>
  );
}
