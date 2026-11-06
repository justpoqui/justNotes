# justNotes

A local-first notebook for Linux. Your notes are plain Markdown files in folders, organised OneNote-style as **Notebook → Section → Page**. Pages are edited in a modern block editor and each page can have a whiteboard. There are no accounts and no cloud, and the app never connects to the internet.

```
~/Documents/justNotes/<Notebook>/<Section>/<Page>.md            ← the page (plain Markdown)
~/Documents/justNotes/<Notebook>/<Section>/<Page>.canvas.json   ← its whiteboard (Excalidraw format)
~/Documents/justNotes/<Notebook>/<Section>/assets/              ← pictures used in that section
```

Your notes stay readable without the app: open any `.md` file in a text editor or another Markdown app.

## Install

**Installable app (recommended).** Run `npm run package` to build:

- `dist/justnotes_<version>_amd64.deb`: install it with `sudo apt install ./dist/justnotes_*.deb`. justNotes then appears in your app menu under Office.
- `dist/justNotes-<version>.AppImage`: a single file that runs without installing. Make it executable (`chmod +x`), then double-click it.

**From the source folder.** `./run.sh` installs Node.js and the packages if needed, builds when the code has changed, and starts the app. If Electron stops with a sandbox error on Chromebook Linux, use `./run.sh --noSandbox`.

## Using it

### Notebooks, sections and pages

- **One notebook is open at a time.**
  - Switch notebooks with **File → Open** or the **Notebook: name ▾** button.
  - **File** also has New, Rename, Delete, **Back up** (save the notebook as a `.zip`) and **Restore** (add a notebook from a backup).
- **Sections are coloured tabs** under the ribbon:
  - **+** adds a section, double-click renames one, and dragging a tab reorders it.
  - Drop a page onto a tab to move the page there.
- **The sidebar lists the pages** of the selected section:
  - Drag pages, or use **Alt+↑/↓**, to reorder them.
  - Double-click or **F2** renames a page.
  - Right-click a page for **Duplicate**, **Move…**, **Page history…**, **Add to Favourites** and more.
- **New pages:** **Ctrl+N** for a blank page, or **Insert → From template** for meeting notes, daily journal, to-do list, project plan or study notes.
- **Recycle bin:** deleting moves things to **File → Recycle bin**, where they're kept for 30 days. A deleted page can also be brought back with **Undo** on the notice that appears.
- **Page history:** while you edit, a copy of the page is kept every 10 minutes, and the last 50 copies are kept. Use **File → History** to preview and restore an earlier version.
- **Recent and Favourite pages:** **View → Recent / Favourites**. **Star page** adds the open page to Favourites.

### Writing

- Type **/** for blocks: headings, to-do lists, bullets, numbers, quotes, code, tables, dividers and pictures. Markdown shortcuts work too (`# `, `- `, `[ ] `, ```` ``` ````, `**bold**`).
- **Home tab:**
  - font, size, bold/italic/underline/strike, text colour, highlight
  - lists, indent, alignment, styles, **Find & Replace**
- **Selecting text** shows a small toolbar with the most-used formatting.
- **Pictures:** paste, drag in, or use Insert → Picture. They're stored in the section's `assets/` folder.
- **Spell-check** (English US or UK, offline). Right-click a word for suggestions, **Add to dictionary** or **Ignore**.
- **AutoCorrect** fixes common typos (teh → the), your own replacements, and words one letter off from exactly one real word.
- **AutoFormat** turns (c) into ©, -- into –, -> into →, ... into … and straight quotes into “curly” ones.
- **Ctrl+Z straight after any automatic change** puts back exactly what you typed.
- Pages **save by themselves** shortly after you stop typing. They also save when you switch pages and when you close the app, and Ctrl+S saves immediately.

### Whiteboard

- Each page has a whiteboard: use the **Page / Whiteboard** switch above the page.
- The **Draw** tab has the drawing tools.
- **Draw → Add to page** puts a picture of the whiteboard at the end of the page.

### Status bar, view and settings

- **Status bar** (bottom): word and character counts, undo/redo, and **page zoom**. Ctrl+= / Ctrl+− / Ctrl+0 and Ctrl+mouse wheel also zoom the page.
- **View tab:** sidebar on/off, dark/light theme, Recent, Favourites.
- **File → Settings** (Ctrl+,):
  - app size, page font and text size, autosave timing
  - spell-check language and every proofing option
  - your AutoCorrect list and personal dictionary
- **F1** shows all keyboard shortcuts.
- **Export PDF** (File tab) saves the open page as a clean, printable PDF.

## How your files are stored

| What | Saved in the `.md` file as |
|---|---|
| Normal text, headings, lists, to-dos, tables, code, links, pictures | Standard Markdown |
| Highlight | `==text==` (coloured highlights: `<mark style="…">`) |
| Font, size, text colour | `<span style="…">text</span>` |
| Underline | `<u>text</u>` |
| Centered / right-aligned paragraph | `<div align="center">` around normal Markdown |
| `[[Wiki links]]` from other apps | Kept exactly as written |

**Hidden bookkeeping** (all inside your notes folder):

| File or folder | What it holds |
|---|---|
| `.order.json` | Your custom section and page order |
| `<Section>/.history/` | Page history |
| `.trash/` | The recycle bin |

**Safety:**
- Saves are atomic, so a crash or power cut can't leave a half-written note.
- Files are only rewritten when you actually edit them.
- YAML front-matter is kept untouched.
- Pages containing other HTML or footnotes open read-only until you choose to edit them.

## Privacy

justNotes makes **no network connections**:
- Every web request is blocked at the app's network layer.
- Chromium's online dictionary download is disabled.
- The spell-check dictionaries and whiteboard fonts are bundled with the app.
- Links you Ctrl+click open in your normal browser.

## For developers

| Command | What it does |
|---|---|
| `npm run dev` | Development mode with hot reload |
| `npm run build` | Builds the app |
| `npm start` | Runs the built app |
| `npm run package` | Builds the `.deb` and the AppImage into `dist/` |
| `npm test` | Unit and Markdown round-trip tests |
| `npm run test:stress` | Stress tests and a randomised save/reload test (`FUZZ_N=2000 FUZZ_SEED=7` for more) |
| `npm run typecheck` | Type-checks the code |

- **Notes folder for testing:** use `JUSTNOTES_ROOT=/some/folder` to try things on a throwaway folder.
- **App icon:** `build/icon.png`. See `build/README.md`.

**Code layout:**
- `src/main/`: file engine and storage (`fileEngine.ts`), IPC, file watcher, PDF export, network and file-access rules
- `src/preload/`: the small, typed bridge the window is allowed to use (`window.wiki`)
- `src/renderer/`: the React app, with the editor in `editor/`, proofing in `proofing/` and the screens in `components/`
