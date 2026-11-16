# Submission: AJDocs

A lightweight collaborative document editor: rich-text editing, file import, images, sharing with owner/editor/viewer roles, comments, version history and export.

| Item | Link |
|---|---|
| Live product | https://ajaia-docs-ouow.onrender.com/ (free tier: the first load after idle takes ~30 s) |
| Walkthrough video | https://youtu.be/umE33RwkvnA |
| Source code | https://github.com/ayadav75/ajdocs |
| Setup and run instructions | [README.md](https://github.com/ayadav75/ajdocs/blob/main/README.md) |
| Architecture note | [ARCHITECTURE.md](https://github.com/ayadav75/ajdocs/blob/main/ARCHITECTURE.md) |
| AI workflow note | [AI_WORKFLOW.md](https://github.com/ayadav75/ajdocs/blob/main/AI_WORKFLOW.md) |
| Automated tests | [server/app.test.js](https://github.com/ayadav75/ajdocs/blob/main/server/app.test.js), run with `npm test` (12 tests) |
| Deploy config | [render.yaml](https://github.com/ayadav75/ajdocs/blob/main/render.yaml) (Render + Neon Postgres) |

**Test accounts:** Alice (`alice@ajaia.test`), Bob (`bob@ajaia.test`), Carol (`carol@ajaia.test`). Choose one on the sign-in screen; there are no passwords.

**Quick sharing check:** as Alice, create a doc and share it with `bob@ajaia.test` (Can edit) and `carol@ajaia.test` (Can view). Bob can edit it; Carol can read and comment only. Any other user gets "Document not found".

**Supported import types:** .txt, .md, .docx (max 2 MB), as a new document or inserted at the cursor of an open one.

**Images:** PNG, JPEG, GIF (animated) and WebP up to 5 MB, via the toolbar, paste, or drag and drop.

**Stretch features included:** presence indicators, comments, version history, Markdown/PDF export, viewer/editor roles, images and GIFs in documents, inserting a file into an existing document.

**Partial or missing:** concurrent edits are last-write-wins with a warning banner (no real-time co-editing). Comments are document-level (no suggestion mode). See [README → Status](https://github.com/ayadav75/ajdocs/blob/main/README.md#status).
