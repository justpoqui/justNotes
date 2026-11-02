# justNotes

A local-first desktop notebook for Linux: Zim-style storage (plain Markdown files
on disk), OneNote-style organization (Notebook → Section → Page), and later an
AFFiNE-style block editor and whiteboard. No accounts, no cloud, no network calls.

```
~/WikiBook/Notebooks/<Notebook>/<Section>/<Page>.md
~/WikiBook/Notebooks/<Notebook>/<Section>/<Page>.canvas.json   (whiteboard, later phase)
```

## Status

**Phase 3 (block editor)** is done. Pages open in a TipTap block editor and save back to the same `.md` file.

- **Autosave** happens 0.6 s after you stop typing. It also saves immediately on Ctrl+S, when you switch pages, before a page is renamed or deleted, and when the window closes. A crash mid-save can't corrupt a note, because the app writes a temp file and swaps it in.
- **Blocks:** type `/` for the block menu (text, headings, to-do list, bullets, numbers, quote, code, divider, table, image). Markdown shortcuts also work as you type: `# `, `## `, `- `, `1. `, `[ ] `, `> `, ```` ``` ````, `---`, `**bold**`, `*italic*`.
- **Formatting toolbar:** appears when you select text (bold, italic, strike, code, H1/H2, link). Ctrl+click a link to open it in your browser.
- **Drag handle** (⠿) on the left of each block to move it.
- **Images:** paste, drag in, or use `/image`. They're copied to `<Section>/assets/` and linked as `![](assets/name.png)`, so they also show up in other Markdown viewers.
- **`[[Wiki Links]]`** are kept exactly and shown as chips. Clicking them and backlinks come in Phase 4.
- **Readable files:** text is only escaped where Markdown actually needs it, so `snake_case`, `5 * 3` and `fish & chips` stay as typed.
- **Your existing notes are protected:**
  - A file is only rewritten after you actually edit it.
  - YAML front-matter is kept untouched.
  - Pages containing HTML, footnotes or reference-style links open read-only with a notice. You can choose "Edit anyway".
  - If another program changes the open page, it reloads. If you also have unsaved edits, you choose which version to keep.
- **Offline:** images from the internet are not loaded.

**Phase 2 (sidebar tree)**:

- Collapsible Notebook → Section → Page tree. It remembers which folders are open, the selected item and the sidebar width (drag the edge to resize; double-click resets).
- Create and rename happen inline in the tree. Use the **+** and **⋯** buttons on hover, right-click, or the keyboard:

  | Key | Action |
  |---|---|
  | ↑ / ↓, Home / End | Move through the tree |
  | → / ← | Expand / collapse (or go to child / parent) |
  | Enter | Expand or collapse a folder |
  | F2, or double-click a page | Rename |
  | Delete | Delete (always asks first for pages and non-empty folders) |
  | Menu key | Open the context menu |

- The right pane shows the selected page as read-only Markdown (the editor is Phase 3), or cards listing a notebook's sections or a section's pages.
- The tree and the open page refresh on their own when files change outside the app, e.g. in Thunar or another editor.

**Phase 1 (file engine)**:

- `src/main/fileEngine.ts`: create, rename, delete and read notebooks, sections and pages. This is the only code that touches the disk.
- `src/main/watcher.ts`: watches the WikiBook folder and tells the UI to refresh.
- `src/main/ipc.ts`: exposes the engine over IPC. Every call returns `{ ok, data | error }`.
- `src/preload/index.ts`: exposes `window.wiki` through `contextBridge` (contextIsolation on, nodeIntegration off, sandbox on).
- `src/renderer/`: the React UI (`components/Sidebar.tsx`, `components/PageView.tsx`, `components/PageEditor.tsx`, `App.tsx`). The editor's extensions and Markdown handling are in `src/renderer/src/editor/`.
- `src/main/assetProtocol.ts`: serves images from inside the WikiBook folder to the editor (`wiki-file://`), and nothing else.

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
./run.sh           # installs Node.js and packages if needed, then starts the app
```

or by hand: `npm install && npm run dev`. If Electron exits with a sandbox error on
Chromebook Linux, use `./run.sh --noSandbox`.

To use a throwaway folder instead of `~/WikiBook/Notebooks`:

```bash
WIKIBOOK_ROOT=/tmp/wikibook-test npm run dev
```

Other scripts: `npm test` (engine unit tests), `npm run typecheck`, `npm run build`.
