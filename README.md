# AJDocs

A lightweight collaborative document editor: create and edit rich-text documents, import files, and share documents with other users.

**Live demo:** https://ajaia-docs-ouow.onrender.com/ (on Render's free tier, the first request after idle takes ~30 s while the service wakes up)

## Demo accounts

No passwords. On the sign-in screen, pick a seeded user:

| User  | Email            |
|-------|------------------|
| Alice | alice@ajaia.test |
| Bob   | bob@ajaia.test   |
| Carol | carol@ajaia.test |

**Sharing flow to try:** sign in as Alice → New document → write something → in the Share panel enter `bob@ajaia.test` (Can edit) → Sign out → sign in as Bob → the doc appears under **Shared with me** and Bob can edit it. Share another doc with Carol as **Can view**: she sees it read-only but can comment. A user it isn't shared with gets "Document not found" when opening its URL directly. To see presence, open the same doc as two users (for example in a normal and a private window).

## Run locally

Requires Node 20+. No database install: local runs use embedded Postgres (PGlite) stored in `./data`.

```bash
npm install
npm run dev       # API on :3000, app on http://localhost:5173
npm test          # API tests (in-memory database)
```

Production-style run: `npm run build && npm start` → http://localhost:3000. Set `DATABASE_URL` to use a real Postgres.

## Features

- **Documents:** create, rename (edit the title inline), edit, delete (owner only). **Autosaves** 1 s after you stop typing and shows a Saving… / Saved / Not saved status with a Retry button. Pending edits are saved when you leave the doc, and the browser warns before you close a tab that has unsaved changes.
- **Formatting:** bold, italic, underline, H1/H2, bulleted and numbered lists (toolbar or the usual keyboard shortcuts). Stored as HTML, so formatting survives a reload.
- **File import:** **.txt, .md, .docx up to 2 MB**. Each file becomes a new editable document titled after the filename. Markdown and Word headings, lists, and bold/italic carry over. Other file types are rejected with a clear message.
- **Sharing with roles:** every doc has one owner. The owner shares by email as **Can edit** or **Can view**, can change the role, and can revoke access. The doc list separates **My documents** from **Shared with me** (owner and role badge). Viewers get a read-only editor; only the owner can share or delete.

### Stretch features (the brief asked for one; all five are in, each kept small)
- **Collaboration indicators:** while a doc is open, the page polls the server every 10 s to show who else is viewing it ("Also here: Bob"). If someone else saves a change, it loads automatically. If you also have unsaved edits, a banner lets you choose between their version and yours. Comments from others appear on the same 10 s cycle.
- **Comments:** a document-level thread that any role can use. Text selected in the doc when you start a comment is quoted with it. Authors and the owner can delete comments.
- **Version history:** the previous content is snapshotted before an edit, at most once every 10 minutes. Editors can restore any version, and the restore itself is snapshotted first, so it can be undone.
- **Export:** Markdown download (underline has no Markdown equivalent and is dropped) and PDF via the browser's print dialog ("Save as PDF").
- **Viewer and editor roles:** see Sharing above.

## Status

**Working end to end:** everything listed above, locally and deployed.

**Not built (deliberate cuts):** true real-time co-editing (concurrent edits are last-write-wins, with a "someone else changed this" banner), suggestion mode, comments anchored to a text range, real authentication, attachments. See [ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning.

**Next 2–4 hours:**
1. Optimistic concurrency: send `updated_at` with each save and reject stale writes, instead of only warning.
2. Comments anchored to a text range (a TipTap mark) with resolve/reopen.
3. Real auth (email magic link) in place of the user picker.
4. Move presence from server memory to the database so it survives multiple instances.

## Deploy (Render + Neon, both free)

1. Create a free Neon Postgres project and copy its connection string.
2. On Render: New → Blueprint, then point it at this repo (uses `render.yaml`). Set `DATABASE_URL` to the Neon string. `COOKIE_SECRET` is generated automatically.
3. The schema and seed users are created on boot.

## Layout

```
server/  app.js (routes + access control), db.js, schema.sql, index.js, app.test.js
client/  React + TipTap UI (App, Login, DocList, Editor, Panels: comments/history/share)
```
