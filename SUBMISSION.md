# Submission

| Item | Where |
|---|---|
| Source code | `server/`, `client/`, `package.json`, `render.yaml` |
| Setup and run instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| Live product URL | https://ajaia-docs-ouow.onrender.com/ (free tier: ~30 s cold start) |
| Walkthrough video URL | `VIDEO_URL.txt` |
| Automated tests | `server/app.test.js` (`npm test`) |

**Test accounts:** Alice (`alice@ajaia.test`), Bob (`bob@ajaia.test`), Carol (`carol@ajaia.test`). Choose one on the sign-in screen; there are no passwords.

**Supported import types:** .txt, .md, .docx (max 2 MB), as a new document or inserted at the cursor of an open one.

**Images:** PNG, JPEG, GIF (animated) and WebP up to 5 MB, via the toolbar, paste, or drag and drop.

**Stretch features included:** presence indicators, comments, version history, Markdown/PDF export, viewer/editor roles, images and GIFs in documents, inserting a file into an existing document.

**Partial or missing:** concurrent edits are last-write-wins, with a warning banner (no real-time co-editing). Comments are document-level (no suggestion mode). See README → Status.
