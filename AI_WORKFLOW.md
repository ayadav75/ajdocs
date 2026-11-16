# AI workflow note

> Skeleton. Replace the bracketed parts with your own honest specifics before submitting.

## Tools used
- Claude Code (Claude Opus) in the terminal: planning, scaffolding, writing the server, client, and tests, and driving a browser for manual checks.
- [Any others you used.]

## Where AI materially sped things up
- Turning the brief into a scoped plan (stack, data model, API, test list, cuts) in minutes.
- Boilerplate-heavy parts: Express routes, the TipTap toolbar, the fetch wrapper, CSS.
- Writing the API tests alongside the code, then running them.

## What I changed or rejected
- [Your edits.] Examples from this build:
  - Opening a doc triggered a save on load. TipTap v3's `setEditable()` emits an update by default. I caught it in the browser and passed `emitUpdate: false`.
  - Inserted images stayed selected, so the next keystroke or inserted file replaced them. A browser check caught it (an image vanished after a file insert); the fix moves the cursor below the image.
  - Image cleanup: deleting an image as soon as it left the text was rejected, because it would break undo after autosave and restoring old versions. It uses a one-day grace period and checks version history instead.
  - [Anything you rejected: e.g. a heavier dependency, a router, an over-built permission system.]

## How I verified correctness and quality
- Automated: `npm test` (12 tests) covers access control, validation, import, image upload/access/cleanup.
- Manual: the full Alice → Bob sharing flow in a real browser; formatting persists after a reload; .docx/.md imports; oversized and unsupported files show clear errors.
- Reviewed every generated file before keeping it. [Add your own review notes.]
