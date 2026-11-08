# justNotes

A local-first notebook for Windows and Linux. Your notes are plain Markdown files in folders, organized OneNote-style as **Notebook → Section → Page**. Pages are edited in a modern block editor and each page can have a whiteboard. There are no accounts and no cloud, and the app never connects to the internet.

```
~/Documents/justNotes/<Notebook>/<Section>/<Page>.md            ← the page (plain Markdown)
~/Documents/justNotes/<Notebook>/<Section>/<Page>.canvas.json   ← its whiteboard (Excalidraw format)
~/Documents/justNotes/<Notebook>/<Section>/assets/              ← pictures used in that section
```

Your notes stay readable without the app: open any `.md` file in a text editor or another Markdown app.

## Install

Download it from the [Releases page](https://github.com/justpoqui/justNotes/releases/latest). Each release has a **Windows PC** and a **Linux** section that says which file to pick.

- **Windows PC:** download `justNotes-Setup-<version>.exe` and open it. The installer lets you pick where to install justNotes (no admin password needed for the usual place), adds Start menu and desktop shortcuts, and can start justNotes when it finishes. Uninstalling (Settings → Apps) never touches your notes. If Windows says "Windows protected your PC", click **More info → Run anyway**: justNotes isn't code-signed yet.
- **Linux (Mint, Ubuntu, Debian):** `justnotes_<version>_amd64.deb`, installed with `sudo apt install ./justnotes_*.deb` (or double-click it on Mint). justNotes then appears in your app menu under Office. Or use `justNotes-x86_64.AppImage`: make it executable (`chmod +x`) and double-click it.
- **ARM Chromebooks** (`uname -m` says `aarch64` in the Linux terminal): the same, with the `arm64` files.

On Windows, your notes are in `Documents\justNotes`; on Linux, `~/Documents/justNotes`.

**Updates.** When a new version is published, justNotes downloads it in the background and shows **Update pending** at the top right. Click it, then **Install and restart**: your pages are saved first. On Windows the new version installs by itself in a few seconds; the `.deb` asks for your password; the AppImage replaces itself. **File → Updates** shows your version and has **Check now**.

**Build it yourself.** `npm run package` makes the same files in `dist/`.

**From the source folder.** `./run.sh` installs Node.js and the packages if needed, builds when the code has changed, and starts the app. If Electron stops with a sandbox error on Chromebook Linux, use `./run.sh --noSandbox`. A copy run this way doesn't update itself.

## Using it

### Notebooks, sections and pages

- **One notebook is open at a time.**
  - Switch notebooks with **File → Open** or the **Notebook: name ▾** button.
  - **File** also has New notebook, Rename, **Back up** (save the notebook as a `.zip`) and **Restore backup** (add a notebook from a backup). To delete a notebook, right-click the **Notebook** button.
  - In **File → Open**, drag notebooks (or use **Alt+↑/↓**) to put them in the order you like.
  - The very first time justNotes starts, it makes **My Notebook** with a short welcome page.
- **Sections are colored tabs** under the ribbon:
  - **+** adds a section, double-click renames one, and dragging a tab reorders it.
  - Each section keeps its color. Right-click a tab to pick another one.
  - Drop a page onto a tab to move the page there.
- **The sidebar lists the pages** of the selected section:
  - Drag pages, or use **Alt+↑/↓**, to reorder them.
  - Double-click or **F2** renames a page.
  - **Subpages:** right-click a page → **Make subpage** (or **Alt+→**) puts it under the page above it, up to two levels deep. **Alt+←** moves it back out, and **New subpage** adds one. Click the small arrow (or press **→ / ←**) to show or hide a page's subpages. A page moves together with its subpages.
  - Right-click a page for **Duplicate**, **Move…**, **Page history…**, **Add to Favorites** and more.
  - The heading at the top of a page is its name: change it, click elsewhere, and the page (and its file) is renamed to match.
- **New pages:** **Ctrl+N** for a blank page, or **Insert → From template** for meeting notes, daily journal, to-do list, project plan or study notes.
- **Automatic backups:** every day (or week), each notebook is saved as a `.zip` in `~/Documents/justNotes Backups/justNotes backup <date>/`, keeping the last 10. Change how often, how many and where in **Settings → General → Backups** (there's also **Back up now**). Bring one back with **File → Restore backup**, which opens in that folder.
- **Recycle bin:** deleting moves things to **File → Recycle bin**, where they're kept for 30 days. A deleted page can also be brought back with **Undo** on the notice that appears.
- **Page history:** while you edit, a copy of the page is kept every 10 minutes, and the last 50 copies are kept. Use **View → Page history** to preview and restore an earlier version, or to **Save a version now**.
- **Go to any page: Ctrl+P** (or View → Go to page). Type part of a page or section name, from any notebook, and press Enter. Letters in order work too ("pln" finds "Planning"), and a second word can name the notebook or section ("home standup"). With nothing typed, it lists your recent pages.
- **Recent and Favorite pages:** **View → Recent / Favorites**. **View → Add to Favorites** adds the open page.

### Writing

- Type **/** for blocks: headings, to-do lists, bullets, numbers, quotes, code, tables, dividers and pictures. Markdown shortcuts work too (`# `, `- `, `[ ] `, ```` ``` ````, `**bold**`).
- **Home tab:**
  - font, size, bold/italic/underline/strike, text color, highlight
  - lists, indent, alignment, styles, **Find & Replace**
- **Date & time:** **Insert → Date & time** (several formats), `/date` and `/time`, or **Alt+Shift+D** / **Alt+Shift+T**.
- **Selecting text** shows a small toolbar with the most-used formatting.
- **Pictures:** paste, drag in, or use Insert → Picture. They're stored in the section's `assets/` folder.
  - Click a picture to show the **Picture** tab (Small / Medium / Large / Original size, Left / Center / Right), or drag the handle at its corner to resize it.
- **Tables:** with the cursor in a table, the **Table** tab adds and deletes rows and columns, switches the header row on or off, and deletes the table.
- **Spell-check** (English US or UK, offline). Right-click a word for suggestions, **Add to dictionary** or **Ignore**.
- **AutoCorrect** fixes common typos (teh → the), your own replacements, and words one letter off from exactly one real word.
- **AutoFormat** turns (c) into ©, -- into –, -> into →, ... into … and straight quotes into “curly” ones.
- **Ctrl+Z straight after any automatic change** puts back exactly what you typed. That word is then left alone (see Settings → Dictionary → Ignored words).
- **Undo** goes back a word at a time.
- Pages **save by themselves** shortly after you stop typing. They also save when you switch pages and when you close the app, and Ctrl+S saves immediately.

### Whiteboard

- Each page has a whiteboard: use the **Page / Whiteboard** switch above the page.
- The **Draw** tab with the drawing tools appears while a whiteboard is open (and goes away on the page).
- The whiteboard has its own undo, redo and zoom (bottom-left of the board).
- **Draw → Add to page** puts a picture of the whiteboard at the end of the page.

### Status bar, view and settings

- **Status bar** (bottom): word and character counts, undo/redo, and **page zoom**. Ctrl+= / Ctrl+− / Ctrl+0 and Ctrl+mouse wheel also zoom the page.
- **View tab:** sidebar on/off, **Wide page**, dark/light theme, Recent, Favorites, Add to Favorites and Page history.
- **File → Settings** (Ctrl+,):
  - app size (everything bigger or smaller), page font and text size, autosave timing
  - spell-check language and every proofing option
  - your AutoCorrect list, personal dictionary and ignored words
- **F1** shows all keyboard shortcuts.
- **File → Page as PDF** saves the open page as a clean, printable PDF.

## How your files are stored

| What | Saved in the `.md` file as |
|---|---|
| Normal text, headings, lists, to-dos, tables, code, links, pictures | Standard Markdown |
| Picture width | `![alt\|300](assets/picture.png)` (the same as Obsidian) |
| Highlight | `==text==` (colored highlights: `<mark style="…">`) |
| Font, size, text color | `<span style="…">text</span>` |
| Underline | `<u>text</u>` |
| Centered / right-aligned paragraph or picture | `<div align="center">` around normal Markdown |
| `[[Wiki links]]` from other apps | Kept exactly as written |

**Hidden bookkeeping** (all inside your notes folder):

| File or folder | What it holds |
|---|---|
| `.order.json` | Your custom notebook, section and page order |
| `<Notebook>/.colors.json` | Section tab colors |
| `<Section>/.subpages.json` | Which pages are subpages |
| `<Section>/.history/` | Page history |
| `.trash/` | The recycle bin |

**Safety:**
- Saves are atomic, so a crash or power cut can't leave a half-written note.
- Files are only rewritten when you actually edit them.
- YAML front-matter is kept untouched.
- Pages containing other HTML or footnotes open read-only until you choose to edit them.

## Privacy

Your notes never leave your computer:
- Every web request from pages and whiteboards is blocked at the app's network layer, so a web picture in a note is never fetched.
- Chromium's online dictionary download is disabled.
- The spell-check dictionaries and whiteboard fonts are bundled with the app.
- Links you Ctrl+click open in your normal browser.

The one exception is **looking for updates**: the installed app asks GitHub (only `github.com` and its download servers) whether a new version is published, at start-up and every few hours. Nothing about you or your notes is sent. Turn it off in **File → Updates** (untick "Check for updates automatically").

## For developers

| Command | What it does |
|---|---|
| `npm run dev` | Development mode with hot reload |
| `npm run build` | Builds the app |
| `npm start` | Runs the built app |
| `npm run package` | Builds the `.deb` and the AppImage into `dist/` |
| (push to GitHub) | `.github/workflows/release.yml` tests (on Linux and Windows), builds (Windows installer; Linux AppImage and .deb for x64 and arm64) and publishes a release, which installed copies then offer as an update |
| `npm test` | Unit and Markdown round-trip tests |
| `npm run test:stress` | Stress tests and a randomised save/reload test (`FUZZ_N=2000 FUZZ_SEED=7` for more) |
| `npm run typecheck` | Type-checks the code |

- **Notes folder for testing:** use `JUSTNOTES_ROOT=/some/folder` to try things on a throwaway folder.
- **App icon:** `build/icon.png`. See `build/README.md`.

**Code layout:**
- `src/main/`: file engine and storage (`fileEngine.ts`), IPC, file watcher, PDF export, network and file-access rules
- `src/preload/`: the small, typed bridge the window is allowed to use (`window.wiki`)
- `src/renderer/`: the React app, with the editor in `editor/`, proofing in `proofing/` and the screens in `components/`

## License

**Copyright © 2026 justpoqui. All rights reserved.** justNotes was created by justpoqui, its original author and owner.

- You may download and use the official releases for free.
- The source code is public so that you can read it. Copying it, changing it, building on it or redistributing it needs written permission from justpoqui. See [LICENSE](LICENSE) for the full terms.
- Your notes always belong to you.

justNotes includes open-source software, fonts and dictionaries made by others, each under its own license. They're listed with their license texts in `THIRD-PARTY-NOTICES.txt`, which ships with the app and is shown in **File → About → Third-party software**. The list is generated automatically from what's actually in the app every time it's built.

