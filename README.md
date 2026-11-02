# justNotes

A local-first desktop notebook for Linux: Zim-style storage (plain Markdown files
on disk), OneNote-style organization (Notebook → Section → Page), and later an
AFFiNE-style block editor and whiteboard. No accounts, no cloud, no network calls.

```
~/Documents/justNotes/<Notebook>/<Section>/<Page>.md
~/Documents/justNotes/<Notebook>/<Section>/<Page>.canvas.json   (whiteboard)
```

## Status

**Moving pages, own title bar, notes folder renamed:**

- **Moving pages.** Use **Move…** in a page's ⋯ menu (or right-click a page) to send it to another section in this notebook or another one.
  - Its whiteboard goes with it.
  - Images it shows are copied to the new section's `assets/` folder and the links updated. The originals stay in place, since other pages may use them.
- **Own title bar.** The system's white title bar is gone. Minimise, maximise and close are at the top-right of the app's dark top bar, and that bar is also where you drag the window. Close saves any unsaved edits first.
- **Notes folder renamed.** Notes now live in `~/Documents/justNotes`. On first start the old `~/WikiBook/Notebooks` is moved there in a single step. It never overwrites an existing folder, and if the move fails the app keeps using the old one.
- **Spellchecker off.** Chromium's spellchecker downloads its dictionaries from Google, so it's turned off to keep the app fully offline.

**One notebook at a time, section tabs, text colour/size/highlight** are done:

- **One notebook at a time.** Only the open notebook is shown. Switch with **File → Open notebook** (or click **Notebook: _name_ ▾** under the ribbon). **File** also has New, Rename and Delete notebook. The app reopens where you left off.
- **Sections are coloured tabs** under the ribbon, next to the notebook name:
  - click to switch, **+** to add, double-click (or F2) to rename, right-click for more
  - the app remembers the last page you had open in each section
- **The sidebar lists the pages** of the selected section: **+** to add, double-click/F2 to rename, Delete to delete, right-click for more. ✎ marks pages that have a whiteboard.
- **Home → Font** has three controls. Since Markdown has no native way to store them, they're saved as small inline HTML tags that most Markdown viewers still display, and the app reloads them exactly:

  | Control | Saved in the file as |
  |---|---|
  | Font size | `<span style="font-size: 24px">…</span>` |
  | Font colour | `<span style="color: #e06c75">…</span>` |
  | Yellow highlight | `==…==` |
  | Other highlight colours | `<mark style="background-color: …">…</mark>` |

**Whiteboard, ribbon and dark theme** are done:

- **Whiteboard per page:** switch with the **Page / Whiteboard** toggle at the top right of a page, or the **Draw** tab.
  - Drawings are saved as `<Page>.canvas.json` next to the page's `.md`. That's standard Excalidraw JSON, so excalidraw.com can open it too.
  - The file is only created once you draw something. Renaming or deleting the page renames or deletes its whiteboard too.
  - The app remembers which pages you last viewed as a whiteboard.
- **Ribbon (top bar) tabs:**
  - **Home:** undo/redo, bold, italic, strike, code, clear formatting, style gallery (Normal, Heading 1–3), bullets, numbering, to-do, quote, indent/outdent.
  - **Insert:** new page, section or notebook; table, picture, code block, divider, link.
  - **Draw:** page/whiteboard switch and whiteboard tools (select, pan, pen, box, circle, arrow, text, picture, eraser).
  - **View:** show/hide the sidebar, dark/light theme, zoom, open the justNotes folder, show the page file.
- **Dark theme** is the default: soft greys, off-white text and a gentle blue accent. Light is available under View.
- **Still fully offline:** the whiteboard's fonts are bundled with the app. Excalidraw's built-in download from the internet is removed at build time (`electron.vite.config.ts`). The automated test checks that no network requests are made.

**Phase 3 (block editor)** is done. Pages open in a TipTap block editor and save back to the same `.md` file.

- **Autosave** happens 0.6 s after you stop typing. It also saves immediately on Ctrl+S, when you switch pages, before a page is renamed or deleted, and when the window closes. A crash mid-save can't corrupt a note, because the app writes a temp file and swaps it in.
- **Blocks:** type `/` for the block menu (text, headings, to-do list, bullets, numbers, quote, code, divider, table, image). Markdown shortcuts also work as you type: `# `, `## `, `- `, `1. `, `[ ] `, `> `, ```` ``` ````, `---`, `**bold**`, `*italic*`.
- **Formatting toolbar:** appears when you select text (bold, italic, strike, code, H1/H2, link). Ctrl+click a link to open it in your browser.
- **Drag handle** (⠿) on the left of each block to move it.
- **Images:** paste, drag in, or use `/image`. They're copied to `<Section>/assets/` and linked as `![](assets/name.png)`, so they also show up in other Markdown viewers.
- **`[[Wiki Links]]`** typed in a page are kept exactly and shown as chips.
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
- `src/main/watcher.ts`: watches the justNotes folder and tells the UI to refresh.
- `src/main/ipc.ts`: exposes the engine over IPC. Every call returns `{ ok, data | error }`.
- `src/preload/index.ts`: exposes `window.wiki` through `contextBridge` (contextIsolation on, nodeIntegration off, sandbox on).
- `src/renderer/`: the React UI (`components/Sidebar.tsx`, `components/PageView.tsx`, `components/PageEditor.tsx`, `App.tsx`). The editor's extensions and Markdown handling are in `src/renderer/src/editor/`.
- `src/main/assetProtocol.ts`: serves images from inside the justNotes folder to the editor (`wiki-file://`), and nothing else.

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
./run.sh           # installs Node.js and packages if needed, builds if the code changed, then starts the app
```

For development with hot reload use `npm run dev`. The packaged build (`./run.sh` / `npm start`) is the one that is fully offline.

or by hand: `npm install && npm run dev`. If Electron exits with a sandbox error on
Chromebook Linux, use `./run.sh --noSandbox`.

To use a throwaway folder instead of `~/Documents/justNotes`:

```bash
JUSTNOTES_ROOT=/tmp/justnotes-test ./run.sh
```

Other scripts: `npm test` (engine unit tests), `npm run typecheck`, `npm run build`.
