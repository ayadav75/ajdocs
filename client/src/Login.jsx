import { useEffect, useState } from 'react';
import { api } from './api.js';
import Logo, { APP_NAME } from './Logo.jsx';

const FEATURES = [
  'Rich-text editing that autosaves as you type',
  'Import .txt, .md and .docx files as new documents',
  'Share with teammates as editors or viewers',
  'Comments, version history and Markdown/PDF export',
];

export default function Login({ onLogin }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { api('/users').then(setUsers, (e) => setError(e.message)); }, []);

  const signIn = (id) => api('/login', { method: 'POST', body: { userId: id } }).then(onLogin, (e) => setError(e.message));

  return (
    <div className="login-page">
      <section className="hero">
        <h1 className="visually-hidden">{APP_NAME}</h1>
        <Logo size="large" />
        <p className="tagline">Write, comment on and share documents with your team</p>
        <p className="lede">
          {APP_NAME} is a lightweight collaborative editor. Write and format documents in the browser,
          bring in existing files, and share them with the people who need to read or edit them.
        </p>
        <ul className="features">
          {FEATURES.map((f) => <li key={f}>{f}</li>)}
        </ul>
      </section>

      <section className="signin-bar" aria-labelledby="signin-heading">
        <div className="signin-label">
          <h2 id="signin-heading">Sign in</h2>
          <p className="muted">Demo accounts, no password needed</p>
        </div>
        <div className="signin-users">
          {users.map((u) => (
            <button key={u.id} className="user-btn" onClick={() => signIn(u.id)}>
              {u.name} <small>{u.email}</small>
            </button>
          ))}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
