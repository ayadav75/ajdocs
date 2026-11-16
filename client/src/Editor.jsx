import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit'; // v3 StarterKit includes Underline
import TurndownService from 'turndown';
import { api } from './api.js';
import { ago, full } from './time.js';
import { CommentsPanel, HistoryPanel, SharePanel } from './Panels.jsx';
import * as I from './Icons.jsx';

const MAC = /Mac|iP/.test(navigator.platform);
const keys = (mac, other) => (MAC ? mac : other);

const TOOLS = [
  { label: 'B', title: 'Bold', keys: keys('⌘B', 'Ctrl+B'), active: ['bold'], run: (c) => c.toggleBold() },
  { label: 'I', title: 'Italic', keys: keys('⌘I', 'Ctrl+I'), active: ['italic'], run: (c) => c.toggleItalic() },
  { label: 'U', title: 'Underline', keys: keys('⌘U', 'Ctrl+U'), active: ['underline'], run: (c) => c.toggleUnderline() },
  { label: 'H1', title: 'Heading 1', keys: keys('⌘⌥1', 'Ctrl+Alt+1'), active: ['heading', { level: 1 }], run: (c) => c.toggleHeading({ level: 1 }) },
  { label: 'H2', title: 'Heading 2', keys: keys('⌘⌥2', 'Ctrl+Alt+2'), active: ['heading', { level: 2 }], run: (c) => c.toggleHeading({ level: 2 }) },
  { label: <I.List />, title: 'Bulleted list', keys: keys('⌘⇧8', 'Ctrl+Shift+8'), active: ['bulletList'], run: (c) => c.toggleBulletList() },
  { label: <I.ListOrdered />, title: 'Numbered list', keys: keys('⌘⇧7', 'Ctrl+Shift+7'), active: ['orderedList'], run: (c) => c.toggleOrderedList() },
];

const PRESENCE_EVERY = 10_000;

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// Open a side panel and bring it into view; on narrow screens the panels sit below the page.
function jumpTo(panelId) {
  const el = document.getElementById(panelId);
  if (!el) return;
  el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.querySelector('textarea, input')?.focus({ preventScroll: true });
}

export default function Editor({ id, me }) {
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState('');
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('Saved');
  const [savedAt, setSavedAt] = useState(null);
  const [others, setOthers] = useState([]);
  const [stale, setStale] = useState(false); // someone else saved while we had unsaved edits
  const [tick, setTick] = useState(0); // bumps every heartbeat: refreshes comments and relative times
  const [quoteRequest, setQuoteRequest] = useState(null);
  const [commentCount, setCommentCount] = useState(0);
  const pending = useRef(null); // unsaved fields, merged until the next save
  const timer = useRef();
  const saving = useRef(Promise.resolve()); // chain saves so they reach the server in order
  const lastKnown = useRef(null); // updated_at of the version we last loaded or saved
  const titleRef = useRef();

  function flush() {
    clearTimeout(timer.current);
    saving.current = saving.current.then(async () => {
      const patch = pending.current;
      if (!patch) return;
      pending.current = null;
      setStatus('Saving…');
      try {
        lastKnown.current = (await api(`/documents/${id}`, { method: 'PATCH', body: patch })).updated_at;
        if (!pending.current) { setStatus('Saved'); setSavedAt(lastKnown.current); }
      } catch (e) {
        pending.current = { ...patch, ...pending.current }; // keep it for the retry
        setStatus(`Not saved: ${e.message}`);
      }
    });
    return saving.current;
  }

  function schedule(fields) {
    pending.current = { ...pending.current, ...fields };
    setStatus('Unsaved changes');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1000);
  }

  const editor = useEditor({
    extensions: [StarterKit],
    editable: false,
    onUpdate: ({ editor }) => schedule({ content_html: editor.getHTML() }),
  });
  const ui = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? {
      active: TOOLS.map((t) => editor.isActive(...t.active)),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
      hasSelection: !editor.state.selection.empty,
    } : { active: [] }),
  });

  // Replace the editor's content with a server copy without triggering a save.
  function apply(d) {
    pending.current = null;
    clearTimeout(timer.current);
    lastKnown.current = d.updated_at;
    setTitle(d.title);
    editor.commands.setContent(d.content_html, { emitUpdate: false });
    setStatus('Saved');
    setSavedAt(d.updated_at);
    setStale(false);
  }

  async function reload() {
    try {
      apply(await api(`/documents/${id}`));
    } catch (e) {
      setStatus(`Couldn’t reload: ${e.message}`);
    }
  }

  useEffect(() => {
    if (!editor) return;
    api(`/documents/${id}`).then((d) => {
      setDoc(d);
      apply(d);
      editor.setEditable(d.role !== 'viewer', false); // false: don't emit an update, or opening a doc would trigger a save
    }, (e) => setLoadError(e.message));
  }, [editor, id]);

  // A fresh doc: put the cursor in the title with it selected, so typing names it.
  useEffect(() => {
    if (doc?.role === 'owner' && doc.title === 'Untitled document' && !doc.content_html) titleRef.current?.select();
  }, [doc]);

  // Heartbeat: who else is here; pick up someone else's save (silently, unless it would clobber our edits).
  useEffect(() => {
    if (!doc) return;
    const beat = () => api(`/documents/${id}/presence`, { method: 'POST' }).then((p) => {
      setOthers(p.others);
      if (p.updated_by_other && new Date(p.updated_at) > new Date(lastKnown.current)) {
        if (pending.current) setStale(true);
        else reload();
      }
      setTick((t) => t + 1);
    }, () => {});
    beat();
    const t = setInterval(beat, PRESENCE_EVERY);
    return () => clearInterval(t);
  }, [doc, id]);

  // Cmd/Ctrl+S saves now; save anything pending when leaving; warn before closing the tab with unsaved edits.
  useEffect(() => {
    const warn = (e) => { if (pending.current) e.preventDefault(); };
    const saveKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); }
    };
    addEventListener('beforeunload', warn);
    addEventListener('keydown', saveKey);
    return () => { removeEventListener('beforeunload', warn); removeEventListener('keydown', saveKey); flush(); };
  }, []);

  if (loadError) return <div className="card"><p className="error" role="alert">{loadError}</p><a href="#/">Back to documents</a></div>;
  if (!doc) return <p className="muted">Loading…</p>;

  const canEdit = doc.role !== 'viewer';
  const isOwner = doc.role === 'owner';
  const titleEmpty = !title.trim();
  const isError = /^(Not saved|Couldn’t)/.test(status);

  const closeMenu = (e) => { e.currentTarget.closest('details').open = false; };
  const exportMarkdown = () => {
    const md = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' }).turndown(editor.getHTML());
    download(`${title.trim().replace(/[\\/:*?"<>|]/g, '_') || 'document'}.md`, md);
  };
  async function deleteDoc() {
    if (!confirm(`Delete "${title}" for everyone? This can't be undone.`)) return;
    try {
      pending.current = null; // nothing left to save
      await api(`/documents/${id}`, { method: 'DELETE' });
      location.hash = '#/';
    } catch (e) {
      setStatus(`Couldn’t delete: ${e.message}`);
    }
  }
  const startComment = () => {
    const { from, to } = editor.state.selection;
    setQuoteRequest({ text: editor.state.doc.textBetween(from, to, ' ').slice(0, 500) });
    jumpTo('comments-panel');
  };

  return (
    <div className="editor-layout">
      <div className="editor-page">
        <div className="doc-header">
          <a href="#/" aria-label="Back to documents" className="no-print"><I.Back /></a>
          <input
            ref={titleRef}
            className="title-input"
            aria-label="Document title"
            value={title}
            maxLength={200}
            readOnly={!canEdit}
            onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) schedule({ title: e.target.value }); }}
            // view.focus() is synchronous; the focus() command waits a frame, and fast typing would land in the title.
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor.view.focus(); editor.commands.setTextSelection(1); } }}
          />
          {/* Only problems are announced to screen readers; routine save progress stays quiet. */}
          <span className={`no-print save-status ${isError || titleEmpty ? 'error' : 'muted'}`}>
            {!canEdit ? 'View only'
              : titleEmpty ? <span role="alert">Title can’t be empty</span>
              : isError ? <span role="alert">{status} {status.startsWith('Not saved') && <button onClick={flush}>Retry</button>}</span>
              : status === 'Saved' && savedAt ? <span title={full(savedAt)}>Saved · {ago(savedAt)}</span>
              : status}
          </span>
          <details className="menu no-print">
            <summary aria-label="More actions"><I.More /></summary>
            <div className="menu-pop" onClick={closeMenu}>
              <button onClick={exportMarkdown}>Export as Markdown</button>
              <button onClick={() => print()}>Export as PDF (print)</button>
              {isOwner && <button className="danger" onClick={deleteDoc}>Delete document</button>}
            </div>
          </details>
        </div>

        <div className="presence no-print">
          {others.length > 0 && <span className="muted">{others.join(', ')} {others.length === 1 ? 'is' : 'are'} also here</span>}
          {!isOwner && <span className="muted">Shared by {doc.owner_name} · you can {canEdit ? 'edit' : 'view and comment'}</span>}
          <span className="jump">
            <button className="link" onClick={() => jumpTo('comments-panel')}>Comments ({commentCount})</button>
            {isOwner && <button className="link" onClick={() => jumpTo('share-panel')}>Share</button>}
          </span>
        </div>

        {stale && (
          <div className="banner no-print" role="alert">
            Someone else changed this document while you were editing.
            <button onClick={reload}>Load theirs (discard my changes)</button>
            <button onClick={() => { setStale(false); flush(); }}>Keep mine</button>
          </div>
        )}

        <div className="toolbar no-print" role="toolbar" aria-label="Formatting">
          {canEdit && (
            <>
              <button title={`Undo (${keys('⌘Z', 'Ctrl+Z')})`} aria-label="Undo" disabled={!ui.canUndo} onClick={() => editor.chain().focus().undo().run()}><I.Undo /></button>
              <button title={`Redo (${keys('⌘⇧Z', 'Ctrl+Y')})`} aria-label="Redo" disabled={!ui.canRedo} onClick={() => editor.chain().focus().redo().run()}><I.Redo /></button>
              <span className="sep" />
              {TOOLS.map((t, i) => (
                <button
                  key={t.title}
                  title={`${t.title} (${t.keys})`}
                  aria-label={t.title}
                  aria-pressed={!!ui.active[i]}
                  className={ui.active[i] ? 'on' : ''}
                  onClick={() => t.run(editor.chain().focus()).run()}
                >
                  {t.label}
                </button>
              ))}
            </>
          )}
          <span className="spacer" />
          <button disabled={!ui.hasSelection} onClick={startComment} title="Comment on the selected text"><I.Comment /> Comment</button>
        </div>

        <EditorContent editor={editor} className="page" />
      </div>

      <aside className="side no-print">
        <CommentsPanel
          docId={doc.id}
          editor={editor}
          tick={tick}
          quoteRequest={quoteRequest}
          onCount={setCommentCount}
          canDelete={(c) => c.user_id === me.id || isOwner}
        />
        <HistoryPanel docId={doc.id} canRestore={canEdit} flush={flush} onRestored={apply} />
        {isOwner && <SharePanel doc={doc} />}
      </aside>
    </div>
  );
}
