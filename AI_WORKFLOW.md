# AI workflow note

I built AJDocs with Claude Code (Claude Opus) as the main pair programmer, plus a set of Claude Code plugins and skills that each covered one part of the job: keeping the code small, reviewing the UX, setting the visual direction, removing generic "AI-looking" styling, and connecting the database. I set the direction, reviewed every change, and checked behavior in a real browser and with tests.

## Tools and plugins

| Tool | What I used it for |
|---|---|
| **Claude Code** (terminal) | Turning the brief into a plan (stack, data model, API, test list, cuts), then writing the server, client, tests and docs, running them, and fixing what failed. |
| **Ponytail** (plugin, "lazy senior dev" mode) | On for the whole build. It pushes for the smallest change that fully solves the task: reuse what's there, no new dependency for a few lines, no options nobody asked for. That's why there's no router, state library or UI kit, why the 9 icons are inline SVG instead of an icon package, and why known limits are marked in code as `shortcut:` comments (in-memory presence, last-write-wins saves). |
| **UI UX Pro Max** (skill) | A structured UX review of every screen (sign-in, document list, editor, side panels), ranked by priority. I then had Claude implement the top items: conflict handling when someone else saves, live comment refresh, focusing the title on a new document, ⌘/Ctrl+S, moving delete into a menu, undo toasts for deleting comments and removing shares, side panels on narrow screens, and accessibility fixes (focus states, alerts that screen readers announce). |
| **Frontend Design** (skill) | Visual direction for the AJDocs redesign: the logo mark and wordmark, a large centered logo with New document / Import file on the home page, and a sign-in page with a separate sign-in bar and a short product description. |
| **Unslop** (plugin, installed from GitHub) | A polish pass to remove generic AI-template styling while keeping layouts and features. It set a direction ("office paper on a desk, violet ink") and then fixed specifics: spacing on a 4 px grid, a fixed 32 px toolbar, emoji and text glyphs replaced with line icons, shorter copy, sentence-case headings, a quiet comment count, a role "stamp" on shared documents, and motion limited to color changes. |
| **Claude in Chrome** | Driving my real browser to test flows end to end: two users at once, sharing and roles, comments on a selection, presence, undo toasts, narrow-screen layout, and inserting images, GIFs and files. |
| **Subagents** | A web-fetch subagent read Neon's agent setup guide so its steps could be followed exactly. At one point a second Claude Code instance worked on the same repo in parallel, and the main session checked that no files had been overwritten before going on. |
| **claude-mem** (plugin) | Memory across sessions. Each new session started with a summary of what earlier ones had built, decided and left open, so I didn't have to explain the project again. |
| **Neon CLI** | `neon login`, then `neon init --agent claude-code` with my project and organization IDs. It linked the project, wrote `DATABASE_URL` to a git-ignored `.env.local`, and installed Neon's Claude Code plugin and MCP server. The app loads that file with Node's `--env-file-if-exists`, so it only applies when the file exists. |
| **GitHub CLI and Render** | `gh repo create` to create and push the repo. Render deploys it from the `render.yaml` blueprint, with the Neon connection string as its only manual setting. |

## Where AI materially sped things up
- Going from the brief to a scoped plan with deliberate cuts in minutes.
- Repetitive parts: Express routes, the TipTap toolbar, the fetch wrapper, CSS.
- Writing API tests alongside each feature and running them after every change.
- UX and visual polish: the review and anti-slop skills produced concrete, prioritized lists to work through instead of open-ended "make it nicer" passes.
- Deployment: repo, database link and deploy in a few commands, with no secrets committed.

## What I changed or rejected
- **A save on every open.** TipTap v3's `setEditable()` emits an update by default, so opening a document triggered a save. A browser check caught it, and the fix passes `emitUpdate: false`.
- **Images getting replaced.** An inserted image stayed selected, so the next keystroke or inserted file replaced it. A browser test caught this when an image vanished after a file insert. The cursor now moves below the image.
- **Deleting images right away.** Rejected: deleting an image the moment it left the text would break undo after autosave and restoring old versions. Cleanup instead waits a day and keeps any image a saved version still uses.
- **Trusting the uploaded file type.** Rejected: the server reads the file's actual bytes, so an SVG (which can run scripts) renamed to `.png` is refused. There's a test for this.
- **Heavier building blocks.** Rejected a client router, a state library, an icon package, websockets for presence, and a separate storage bucket for images. Each was more than the feature needed (see ARCHITECTURE.md → Deliberate cuts).
- **Local runs writing to production.** After `neon init`, local dev pointed at the production database. I kept the browser tests on the embedded PGlite database so no test data reached Neon.

## How I verified correctness and quality
- **Automated:** `npm test` runs 12 Vitest + Supertest tests against in-memory Postgres. They cover access control (private by default, sharing, owner-only actions, 404 for outsiders), validation, import, viewer/editor roles, versions, presence, inserting a file into a document, image upload, access and type checks, and image cleanup.
- **Manual, in a real browser:** the Alice → Bob → Carol sharing flow, formatting surviving a reload, .docx/.md import, inserting files and images (including a pasted image and a GIF), the conflict banner, comments, version restore, export, and the layout at phone width.
- **Deployed:** after each push, checked the live Render app against Neon (seeded users load, new routes respond).
- **Review:** read every diff before keeping it. The production build and the tests ran after each change.
