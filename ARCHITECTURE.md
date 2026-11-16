# Architecture note

## Shape

One Node service, one repo, one URL. Express serves the JSON API under `/api` and the built React app as static files, so there's no CORS and only one thing to deploy.

```
Browser (React + TipTap) ──fetch──▶ Express (/api) ──SQL──▶ Postgres (Neon in prod, PGlite locally/tests)
```

## What I prioritized and why

1. **An editing flow that feels solid.** TipTap (ProseMirror) gives correct rich-text behavior for free. I spent my effort on the parts users notice: autosave with a visible status, a retry when a save fails, saving pending edits when you leave the doc, and a warning before closing a tab with unsaved changes. Saves are chained so they reach the server in order.
2. **Access control that is easy to verify.** One function, `getDoc()` in `server/app.js`, decides who can see a document; every document route goes through it. Docs a user can't access return 404 rather than 403, so document ids don't leak. Owner-only actions (share, unshare, delete) add one `requireOwner` check. The automated tests focus here.
3. **Zero-friction setup for reviewers.** Local runs and tests use PGlite (real Postgres compiled to WASM), so `npm install && npm run dev` works with no database. Production uses the same SQL against Neon Postgres through a single `query()` function.

## Key decisions

- **Content is stored as HTML.** It's what TipTap emits and what the import converters (mammoth, marked) produce, so there's one format end to end with no conversion layer. Stored HTML is only ever rendered through TipTap, whose schema drops any element it doesn't know (scripts, iframes, event handlers). Plain-text imports are HTML-escaped.
- **Mocked auth.** A seeded-user picker sets a signed, httpOnly cookie. Passwords would add work without showing anything the exercise evaluates. The server still never trusts a client-supplied user id beyond that signed cookie.
- **Sharing model: owner, editor, viewer.** A share is a row in `document_shares(document_id, user_id, role)`. `getDoc()` returns the caller's role, and two guards, `requireEditor` and `requireOwner`, sit in front of writes, restores, sharing and deletes.
- **Stretch features are deliberately thin.**
  - Presence is a 10 s polling heartbeat held in server memory, not websockets: it's enough to show "who's here" and to warn on a conflicting save. `documents.updated_by` keeps your own saves from triggering that warning.
  - Comments are document-level, with an optional quote of the selected text.
  - History snapshots the previous content at most every 10 minutes, so autosave doesn't flood it.
  - Export is Turndown for Markdown plus the browser's print-to-PDF, so the server does no PDF rendering.
  - The brief asked for one stretch feature. All five were added on request, each in the smallest working form, with tests.
- **Import creates a new doc** instead of attaching a file. It's the most useful behavior for an editor, and it needs no file storage.
- **Hash routing, plain CSS, no state library.** The app has three screens; a router, UI kit, or store would be dead weight.

## Deliberate cuts

| Cut | Why / what I'd do |
|---|---|
| Real-time co-editing | Large (Yjs + websockets). Today concurrent saves are last-write-wins, and presence warns when someone else saved. The next step is an `updated_at` version check. |
| Suggestion mode, anchored comments | Each needs custom editor marks and resolve flows. Document-level comments with quotes cover the review use case for now. |
| Multi-instance presence | Presence lives in server memory (marked `shortcut:` in code). Fine for one Render instance. |
| Real auth | Not what's being evaluated. Would add email magic links. |
| PDF import | Converting PDF to formatted HTML is unreliable. Out of scope, and the UI says so. |

## Testing

`server/app.test.js` (Vitest + Supertest, in-memory PGlite) covers: private by default → shared → recipient can read and edit and sees it under "shared"; non-owners can't share or delete; unauthenticated requests are rejected; validation; Markdown import structure; text escaping; unsupported file types; viewers can read and comment but not edit or restore; version snapshot and restore; presence, including the "edited by someone else" flag and a 404 for outsiders. I verified the UI by hand in the browser (formatting persists after a reload, the owner/shared split, Bob's view of a shared doc).
