# justNotes

A local-first desktop notebook for Linux: Zim-style storage (plain Markdown files
on disk), OneNote-style organization (Notebook → Section → Page), and later an
AFFiNE-style block editor and whiteboard. No accounts, no cloud, no network calls.

```
~/WikiBook/Notebooks/<Notebook>/<Section>/<Page>.md
~/WikiBook/Notebooks/<Notebook>/<Section>/<Page>.canvas.json   (whiteboard, later phase)
```

## Status: Phase 1 (file engine)

- `src/main/fileEngine.ts`: create, rename and delete notebooks, sections and pages. This is the only code that touches the disk.
- `src/main/ipc.ts`: exposes the engine over IPC. Every call returns `{ ok, data | error }`.
- `src/preload/index.ts`: exposes `window.wiki` through `contextBridge` (contextIsolation on, nodeIntegration off, sandbox on).
- `src/renderer/`: a bare-bones React test UI.

Rules the engine enforces:

| Situation | Behaviour |
|---|---|
| Duplicate name at the same level | `DUPLICATE` error. Matching ignores case, so `Work` and `work` can't both exist. |
| Invalid characters `/ \ : * ? " < > \| [ ] #`, control chars, leading `.` or trailing `.`, empty, > 120 chars | `INVALID_NAME` with the reason |
| Deleting a non-empty notebook or section | `NOT_EMPTY` error with a count of what's inside; the UI asks for confirmation and then deletes with `force` |
| Item missing on disk (e.g. deleted in the file manager) | `NOT_FOUND` |
| Renaming or deleting a page | Its `.canvas.json` whiteboard file is renamed or deleted too. A rename also updates the default `# Title` heading. |

`[ ] #` are reserved because they will break `[[Wiki Links]]` / `[[Page#Heading]]`
in Phase 4. The other characters are rejected so that notes stay portable to USB
drives and Windows.

## Setup (Linux Mint / Chromebook Linux)

Requires Node.js 20+ (22 recommended):

```bash
npm install
npm run dev        # launches the app with hot reload
```

If Electron exits with a sandbox error on Chromebook Linux, run `npm run dev -- --noSandbox`.

To use a throwaway folder instead of `~/WikiBook/Notebooks`:

```bash
WIKIBOOK_ROOT=/tmp/wikibook-test npm run dev
```

Other scripts: `npm test` (engine unit tests), `npm run typecheck`, `npm run build`.
