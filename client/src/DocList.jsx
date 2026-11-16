import { useEffect, useState } from 'react';
import { api } from './api.js';
import { ago, full } from './time.js';
import Logo from './Logo.jsx';

const open = (doc) => { location.hash = `#/doc/${doc.id}`; };
const ACCEPT = '.txt,.md,.docx';

export default function DocList() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { api('/documents').then(setDocs, (e) => setError(e.message)); }, []);

  const create = () => api('/documents', { method: 'POST', body: {} }).then(open, (e) => setError(e.message));

  async function importFile(file) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setImporting(true);
    setError('');
    try {
      open(await api('/documents/import', { method: 'POST', body: form }));
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  // The whole list is a drop target for importing; the server still validates type and size.
  const drop = {
    onDragOver: (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); },
    onDrop: (e) => { e.preventDefault(); setDragging(false); importFile(e.dataTransfer.files[0]); },
  };

  return (
    <section className={`dropzone ${dragging ? 'dragging' : ''}`} {...drop}>
      <div className="home-hero">
        <h1 className="visually-hidden">AJDocs</h1>
        <Logo size="large" />
        <div className="actions">
          <button className="primary" onClick={create}>New document</button>
          <label className="button" title="Each file becomes a new document. You can also drop a file anywhere on this page.">
            {importing ? 'Importing…' : 'Import file'}
            <input type="file" accept={ACCEPT}
              onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; importFile(f); }}
              disabled={importing} className="visually-hidden" />
          </label>
        </div>
        <p className="muted">.txt, .md, .docx · max 2 MB · or drop a file here</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {docs && (
        <>
          <DocSection title="My documents" docs={docs.owned} empty="No documents yet. Create one or import a file." />
          <DocSection title="Shared with me" docs={docs.shared} empty="Nothing has been shared with you yet." />
        </>
      )}
      {!docs && !error && <p className="muted">Loading…</p>}
      {dragging && <div className="drop-hint" aria-hidden="true">Drop to import as a new document</div>}
    </section>
  );
}

function DocSection({ title, docs, empty }) {
  return (
    <>
      <h2>{title}</h2>
      {docs.length ? (
        <ul className="doc-list rows">
          {docs.map((d) => (
            <li key={d.id}>
              <a href={`#/doc/${d.id}`}>{d.title}</a>
              <span className="muted">
                {d.owner_name && <span>From {d.owner_name}<span className="badge">{d.role}</span></span>}
                <span title={full(d.updated_at)}>Edited {ago(d.updated_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="muted">{empty}</p>}
    </>
  );
}
