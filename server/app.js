import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import mammoth from 'mammoth';
import { marked } from 'marked';
import { query } from './db.js';

const MAX_UPLOAD = 2 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD } });

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

// Postgres INT ids: reject anything that isn't a positive int4 before it reaches SQL.
const toId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : null; };

function cleanTitle(title) {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) fail(400, 'Title must be 1–200 characters');
  return title.trim();
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const IMPORTERS = {
  '.txt': (buf) => buf.toString('utf8').split(/\r?\n/).map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
  '.md': (buf) => marked.parse(buf.toString('utf8')),
  '.docx': async (buf) => (await mammoth.convertToHtml({ buffer: buf })).value,
};

export const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET ?? 'dev-only-secret'));

// --- Mocked auth: pick a seeded user, identity lives in a signed httpOnly cookie ---

app.get('/api/users', async (req, res) => {
  res.json(await query('SELECT id, name, email FROM users ORDER BY id'));
});

app.post('/api/login', async (req, res) => {
  const [user] = await query('SELECT id, name, email FROM users WHERE id = $1', [toId(req.body?.userId)]);
  if (!user) fail(400, 'Unknown user');
  res.cookie('uid', String(user.id), {
    signed: true, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
  });
  res.json(user);
});

app.post('/api/logout', (req, res) => { res.clearCookie('uid'); res.status(204).end(); });

async function requireUser(req, res, next) {
  const id = toId(req.signedCookies.uid);
  const [user] = id ? await query('SELECT id, name, email FROM users WHERE id = $1', [id]) : [];
  if (!user) fail(401, 'Please sign in');
  req.user = user;
  next();
}

app.get('/api/me', requireUser, (req, res) => res.json(req.user));
app.use('/api/documents', requireUser);

// --- Access control: the single place that decides who can see a document ---

// Returns the doc with role 'owner' | 'editor' | 'viewer'. Inaccessible and missing docs both 404, so ids don't leak.
async function getDoc(req) {
  const id = toId(req.params.id);
  const [doc] = id ? await query(
    `SELECT d.*, u.name AS owner_name,
            CASE WHEN d.owner_id = $2 THEN 'owner' ELSE s.role END AS role
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = $2
      WHERE d.id = $1 AND (d.owner_id = $2 OR s.user_id IS NOT NULL)`,
    [id, req.user.id],
  ) : [];
  if (!doc) fail(404, 'Document not found');
  return doc;
}

const requireOwner = (doc) => doc.role === 'owner' || fail(403, 'Only the owner can do that');
const requireEditor = (doc) => doc.role !== 'viewer' || fail(403, 'You have view-only access');

// --- Documents ---

app.get('/api/documents', async (req, res) => {
  const owned = await query(
    'SELECT id, title, updated_at FROM documents WHERE owner_id = $1 ORDER BY updated_at DESC', [req.user.id]);
  const shared = await query(
    `SELECT d.id, d.title, d.updated_at, u.name AS owner_name, s.role
       FROM documents d
       JOIN document_shares s ON s.document_id = d.id
       JOIN users u ON u.id = d.owner_id
      WHERE s.user_id = $1 ORDER BY d.updated_at DESC`, [req.user.id]);
  res.json({ owned, shared });
});

app.post('/api/documents', async (req, res) => {
  const title = req.body?.title === undefined ? 'Untitled document' : cleanTitle(req.body.title);
  const [doc] = await query(
    'INSERT INTO documents (owner_id, title) VALUES ($1, $2) RETURNING *', [req.user.id, title]);
  res.status(201).json(doc);
});

app.post('/api/documents/import', upload.single('file'), async (req, res) => {
  if (!req.file) fail(400, 'Choose a file to import');
  const ext = path.extname(req.file.originalname).toLowerCase();
  const convert = IMPORTERS[ext];
  if (!convert) fail(400, 'Unsupported file type. Use .txt, .md or .docx');
  let html;
  try { html = await convert(req.file.buffer); } catch { fail(400, 'Could not read that file'); }
  const title = path.basename(req.file.originalname, ext).trim().slice(0, 200) || 'Imported document';
  const [doc] = await query(
    'INSERT INTO documents (owner_id, title, content_html) VALUES ($1, $2, $3) RETURNING *',
    [req.user.id, title, html]);
  res.status(201).json(doc);
});

app.get('/api/documents/:id', async (req, res) => {
  const doc = await getDoc(req);
  doc.shares = doc.role === 'owner' ? await query(
    `SELECT u.id, u.name, u.email, s.role FROM document_shares s JOIN users u ON u.id = s.user_id
      WHERE s.document_id = $1 ORDER BY u.name`, [doc.id]) : [];
  res.json(doc);
});

const VERSION_EVERY = '10 minutes';

// Snapshot the doc as it is *before* a change, at most once per VERSION_EVERY, so autosave doesn't flood history.
async function snapshot(doc, userId, force = false) {
  if (!doc.content_html && !force) return;
  await query(
    `INSERT INTO document_versions (document_id, title, content_html, created_by)
     SELECT $1, $2, $3, $4
      WHERE $5 OR NOT EXISTS (SELECT 1 FROM document_versions
                               WHERE document_id = $1 AND created_at > now() - $6::interval)`,
    [doc.id, doc.title, doc.content_html, userId, force, VERSION_EVERY]);
}

async function writeDoc(docId, userId, title, html) {
  const [updated] = await query(
    `UPDATE documents SET title = $3, content_html = $4, updated_at = now(), updated_by = $2
      WHERE id = $1 RETURNING id, title, content_html, updated_at`,
    [docId, userId, title, html]);
  return updated;
}

// shortcut: last write wins between concurrent editors (the UI warns via presence); add a version check or CRDT for true co-editing.
app.patch('/api/documents/:id', async (req, res) => {
  const doc = await getDoc(req);
  requireEditor(doc);
  const { title, content_html } = req.body ?? {};
  const newTitle = title === undefined ? doc.title : cleanTitle(title);
  if (content_html !== undefined && (typeof content_html !== 'string' || content_html.length > 1_000_000)) {
    fail(400, 'Content must be text under 1 MB');
  }
  if (content_html !== undefined && content_html !== doc.content_html) await snapshot(doc, req.user.id);
  const { id, updated_at } = await writeDoc(doc.id, req.user.id, newTitle, content_html ?? doc.content_html);
  res.json({ id, title: newTitle, updated_at });
});

// --- Version history ---

app.get('/api/documents/:id/versions', async (req, res) => {
  const doc = await getDoc(req);
  res.json(await query(
    `SELECT v.id, v.title, v.content_html, v.created_at, u.name AS created_by_name
       FROM document_versions v LEFT JOIN users u ON u.id = v.created_by
      WHERE v.document_id = $1 ORDER BY v.created_at DESC, v.id DESC LIMIT 50`, [doc.id]));
});

app.post('/api/documents/:id/versions/:versionId/restore', async (req, res) => {
  const doc = await getDoc(req);
  requireEditor(doc);
  const [version] = await query(
    'SELECT title, content_html FROM document_versions WHERE id = $1 AND document_id = $2',
    [toId(req.params.versionId), doc.id]);
  if (!version) fail(404, 'Version not found');
  await snapshot(doc, req.user.id, true); // so the restore itself can be undone
  res.json(await writeDoc(doc.id, req.user.id, version.title, version.content_html));
});

// --- Comments (document-level; any role can comment) ---

app.get('/api/documents/:id/comments', async (req, res) => {
  const doc = await getDoc(req);
  res.json(await query(
    `SELECT c.id, c.body, c.quote, c.created_at, c.user_id, u.name AS author
       FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.document_id = $1 ORDER BY c.created_at`, [doc.id]));
});

app.post('/api/documents/:id/comments', async (req, res) => {
  const doc = await getDoc(req);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 2000) fail(400, 'Comment must be 1–2000 characters');
  const quote = typeof req.body?.quote === 'string' && req.body.quote.trim() ? req.body.quote.trim().slice(0, 500) : null;
  const [comment] = await query(
    `INSERT INTO comments (document_id, user_id, body, quote) VALUES ($1, $2, $3, $4)
     RETURNING id, body, quote, created_at, user_id`, [doc.id, req.user.id, body, quote]);
  res.status(201).json({ ...comment, author: req.user.name });
});

app.delete('/api/documents/:id/comments/:commentId', async (req, res) => {
  const doc = await getDoc(req);
  const [comment] = await query('SELECT user_id FROM comments WHERE id = $1 AND document_id = $2',
    [toId(req.params.commentId), doc.id]);
  if (!comment) fail(404, 'Comment not found');
  if (comment.user_id !== req.user.id && doc.role !== 'owner') fail(403, 'You can only delete your own comments');
  await query('DELETE FROM comments WHERE id = $1', [toId(req.params.commentId)]);
  res.status(204).end();
});

// --- Presence: who else has this doc open, and whether someone else changed it ---

// shortcut: in-memory, so it only works on a single server instance; move to Redis/DB if we ever scale out.
const presence = new Map(); // docId -> Map(userId -> { name, seen })
const PRESENCE_TTL = 20_000;

app.post('/api/documents/:id/presence', async (req, res) => {
  const doc = await getDoc(req);
  const now = Date.now();
  const here = presence.get(doc.id) ?? new Map();
  here.set(req.user.id, { name: req.user.name, seen: now });
  for (const [uid, p] of here) if (now - p.seen > PRESENCE_TTL) here.delete(uid);
  presence.set(doc.id, here);
  res.json({
    others: [...here].filter(([uid]) => uid !== req.user.id).map(([, p]) => p.name),
    updated_at: doc.updated_at,
    updated_by_other: doc.updated_by !== null && doc.updated_by !== req.user.id,
  });
});

app.delete('/api/documents/:id', async (req, res) => {
  const doc = await getDoc(req);
  requireOwner(doc);
  await query('DELETE FROM documents WHERE id = $1', [doc.id]);
  res.status(204).end();
});

// --- Sharing (owner only) ---

app.post('/api/documents/:id/shares', async (req, res) => {
  const doc = await getDoc(req);
  requireOwner(doc);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const [user] = await query('SELECT id, name, email FROM users WHERE email = $1', [email]);
  if (!user) fail(400, 'No user with that email');
  if (user.id === doc.owner_id) fail(400, 'You already own this document');
  const role = req.body?.role ?? 'editor';
  if (role !== 'editor' && role !== 'viewer') fail(400, 'Role must be editor or viewer');
  // Sharing again with the same person changes their role.
  await query(
    `INSERT INTO document_shares (document_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (document_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [doc.id, user.id, role]);
  res.status(201).json({ ...user, role });
});

app.delete('/api/documents/:id/shares/:userId', async (req, res) => {
  const doc = await getDoc(req);
  requireOwner(doc);
  await query('DELETE FROM document_shares WHERE document_id = $1 AND user_id = $2', [doc.id, toId(req.params.userId)]);
  res.status(204).end();
});

// --- Frontend (production build) and errors ---

const dist = fileURLToPath(new URL('../client/dist', import.meta.url));
if (existsSync(dist)) app.use(express.static(dist));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  const status = err instanceof multer.MulterError ? 400 : err.status ?? 500;
  if (status >= 500) console.error(err);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 2 MB'
    : status >= 500 ? 'Something went wrong' : err.message;
  res.status(status).json({ error: message });
});
