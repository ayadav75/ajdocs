import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { ago, full } from './time.js';

// DOMParser doesn't run scripts, so this is a safe way to get plain text for a preview.
const preview = (html) => (new DOMParser().parseFromString(html, 'text/html').body.textContent || '(empty)').slice(0, 140);
// Side panels start open on wide screens, collapsed when they'd sit below the page.
const startOpen = () => matchMedia('(min-width: 1001px)').matches;
const UNDO_MS = 5000;

function useToast() {
  const [toast, setToast] = useState(null); // { msg, undo? }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast && (
    <div className="toast" role="status">
      {toast.msg}
      {toast.undo && <button className="link" onClick={() => { toast.undo(); setToast(null); }}>Undo</button>}
    </div>
  );
  return [node, setToast];
}

export function CommentsPanel({ docId, editor, canDelete, tick, quoteRequest, onCount }) {
  const [initiallyOpen] = useState(startOpen);
  const [comments, setComments] = useState([]);
  const [hidden, setHidden] = useState(() => new Set()); // deleted, waiting out the undo window
  const [body, setBody] = useState('');
  const [quote, setQuote] = useState('');
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();
  const deletes = useRef(new Map()); // commentId -> timer
  const textarea = useRef();

  // Refreshes on every presence heartbeat, so teammates' comments appear without reopening the doc.
  useEffect(() => {
    api(`/documents/${docId}/comments`).then(setComments, (e) => tick === 0 && setError(e.message));
  }, [docId, tick]);

  const visible = comments.filter((c) => !hidden.has(c.id));
  useEffect(() => onCount(visible.length), [visible.length]);

  useEffect(() => {
    if (!quoteRequest) return;
    setQuote(quoteRequest.text);
    textarea.current?.focus();
  }, [quoteRequest]);

  // Deletes still in their undo window go through when you leave the doc.
  useEffect(() => () => {
    for (const [id, t] of deletes.current) {
      clearTimeout(t);
      api(`/documents/${docId}/comments/${id}`, { method: 'DELETE' }).catch(() => {});
    }
  }, [docId]);

  // Whatever is selected in the document when you start a comment becomes its quote.
  const captureQuote = () => {
    const { from, to } = editor.state.selection;
    setQuote(editor.state.doc.textBetween(from, to, ' ').slice(0, 500));
  };

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      const c = await api(`/documents/${docId}/comments`, { method: 'POST', body: { body, quote } });
      setComments((cs) => [...cs, c]);
      setBody('');
      setQuote('');
    } catch (err) {
      setError(err.message);
    }
  }

  const unhide = (id) => setHidden((h) => { const n = new Set(h); n.delete(id); return n; });

  function remove(c) {
    setHidden((h) => new Set(h).add(c.id));
    const t = setTimeout(async () => {
      deletes.current.delete(c.id);
      try {
        await api(`/documents/${docId}/comments/${c.id}`, { method: 'DELETE' });
        setComments((cs) => cs.filter((x) => x.id !== c.id));
      } catch (err) {
        setError(err.message);
      }
      unhide(c.id);
    }, UNDO_MS);
    deletes.current.set(c.id, t);
    showToast({ msg: 'Comment deleted', undo: () => { clearTimeout(t); deletes.current.delete(c.id); unhide(c.id); } });
  }

  return (
    <details className="card panel" id="comments-panel" open={initiallyOpen}>
      <summary>Comments <span className="muted">{visible.length}</span></summary>
      <ul className="comments">
        {visible.map((c) => (
          <li key={c.id}>
            {c.quote && <blockquote>{c.quote}</blockquote>}
            <p>{c.body}</p>
            <span className="muted" title={full(c.created_at)}>{c.author} · {ago(c.created_at)}</span>{' '}
            {canDelete(c) && <button className="link" onClick={() => remove(c)}>Delete</button>}
          </li>
        ))}
      </ul>
      <form onSubmit={add}>
        {quote && <blockquote>{quote} <button type="button" className="link" onClick={() => setQuote('')}>Remove quote</button></blockquote>}
        <label htmlFor="comment-body" className="visually-hidden">Add a comment</label>
        <textarea id="comment-body" ref={textarea} rows={2} required maxLength={2000}
          placeholder="Add a comment"
          value={body} onFocus={() => !body && !quote && captureQuote()} onChange={(e) => setBody(e.target.value)} />
        <button className="primary">Comment</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {toast}
    </details>
  );
}

export function HistoryPanel({ docId, canRestore, flush, onRestored }) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');

  const load = () => api(`/documents/${docId}/versions`).then(setVersions, (e) => setError(e.message));

  async function restore(v) {
    if (!confirm(`Restore the version from ${full(v.created_at)}? The current text is kept in history, so you can undo this.`)) return;
    setError('');
    try {
      await flush(); // a pending autosave must not land on top of the restored content
      onRestored(await api(`/documents/${docId}/versions/${v.id}/restore`, { method: 'POST' }));
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <details className="card panel" onToggle={(e) => e.currentTarget.open && load()}>
      <summary>Version history</summary>
      <p className="muted">Snapshots are taken automatically about every 10 minutes while the document is being edited.</p>
      {versions?.length === 0 && <p className="muted">No earlier versions yet.</p>}
      <ul className="comments">
        {versions?.map((v) => (
          <li key={v.id}>
            <strong title={full(v.created_at)}>{ago(v.created_at)}</strong> <span className="muted">by {v.created_by_name ?? 'unknown'}</span>
            <p className="muted">{v.title}: {preview(v.content_html)}</p>
            {canRestore && <button onClick={() => restore(v)}>Restore</button>}
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
    </details>
  );
}

export function SharePanel({ doc }) {
  const [initiallyOpen] = useState(startOpen);
  const [shares, setShares] = useState(doc.shares);
  const [people, setPeople] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();

  useEffect(() => { api('/users').then(setPeople, () => {}); }, []);
  const suggestions = people.filter((p) => p.id !== doc.owner_id && !shares.some((s) => s.id === p.id));
  const verb = (r) => (r === 'viewer' ? 'view' : 'edit');

  async function share(shareEmail, shareRole) {
    setError('');
    try {
      const user = await api(`/documents/${doc.id}/shares`, { method: 'POST', body: { email: shareEmail, role: shareRole } });
      setShares((s) => [...s.filter((u) => u.id !== user.id), user]);
      showToast({ msg: `${user.name} can now ${verb(user.role)}` });
      return true;
    } catch (err) {
      setError(err.message);
    }
  }

  async function unshare(user) {
    try {
      await api(`/documents/${doc.id}/shares/${user.id}`, { method: 'DELETE' });
      setShares((s) => s.filter((u) => u.id !== user.id));
      showToast({ msg: `Removed ${user.name}`, undo: () => share(user.email, user.role) });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <details className="card panel share" id="share-panel" open={initiallyOpen}>
      <summary>Share</summary>
      <form onSubmit={async (e) => { e.preventDefault(); if (await share(email, role)) setEmail(''); }} className="actions">
        <label htmlFor="share-email" className="visually-hidden">Email to share with</label>
        <input id="share-email" type="email" required list="share-people" autoComplete="off"
          placeholder="Name or email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <datalist id="share-people">
          {suggestions.map((p) => <option key={p.id} value={p.email}>{p.name}</option>)}
        </datalist>
        <label htmlFor="share-role" className="visually-hidden">Access level</label>
        <select id="share-role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="editor">Can edit</option>
          <option value="viewer">Can view</option>
        </select>
        <button className="primary">Share</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {shares.length ? (
        <ul className="doc-list">
          {shares.map((u) => (
            <li key={u.id} data-role={u.role}>
              <span>{u.name}</span>
              <span className="muted">{u.email}</span>
              <select aria-label={`Access for ${u.name}`} value={u.role} onChange={(e) => share(u.email, e.target.value)}>
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button onClick={() => unshare(u)}>Remove</button>
            </li>
          ))}
        </ul>
      ) : <p className="muted">Only you can see this document.</p>}
      {toast}
    </details>
  );
}
