// Export a page as PDF. The page's HTML is rendered on its own in a hidden
// window (scripts disabled), styled for paper, then saved.

import { BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EngineFailure } from './fileEngine'

const PRINT_CSS = `
  @page { margin: 18mm 16mm; }
  body { font: 11.5pt/1.55 system-ui, 'DejaVu Sans', sans-serif; color: #111; margin: 0; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.1em 0 0.3em; }
  h1:first-child { margin-top: 0; }
  p { margin: 0 0 0.55em; }
  img { max-width: 100%; }
  pre { background: #f4f4f1; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; font: 9.5pt/1.5 'DejaVu Sans Mono', monospace; }
  code { font-family: 'DejaVu Sans Mono', monospace; font-size: 0.9em; background: #f4f4f1; padding: 0 3px; border-radius: 3px; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0.6em 0; padding-left: 12px; border-left: 3px solid #ccc; color: #555; }
  table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
  th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f4f1; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0.2em; }
  ul[data-type="taskList"] li { display: flex; gap: 8px; }
  ul[data-type="taskList"] li > label { flex: none; }
  ul[data-type="taskList"] li[data-checked="true"] > div { text-decoration: line-through; color: #777; }
  mark { background: #f6e58d; padding: 0 2px; }
  .wiki-link { color: #2b6b64; }
  hr { border: none; border-top: 1px solid #ccc; margin: 1.2em 0; }
`

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Loads the page HTML into a hidden, script-less window. */
async function renderPage(html: string, title: string): Promise<{ win: BrowserWindow; cleanup: () => Promise<void> }> {
  // Strict policy: no scripts, nothing from the internet (pictures only from the notes / app).
  const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src wiki-file: file: data: blob:; font-src file: data: jn-asset:"
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${html}</body></html>`
  const file = path.join(os.tmpdir(), `justnotes-print-${process.pid}-${Date.now()}.html`)
  await fs.writeFile(file, doc, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } })
  await win.loadFile(file)
  // Give pictures a moment to load.
  await new Promise((r) => setTimeout(r, 300))
  return {
    win,
    cleanup: async () => {
      if (!win.isDestroyed()) win.destroy()
      await fs.rm(file, { force: true })
    }
  }
}

const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'page'

/** Asks where to save, then writes the PDF. Resolves to the saved path, or null if cancelled. */
export async function exportPdf(owner: BrowserWindow | null, html: string, title: string): Promise<string | null> {
  const opts = {
    title: 'Export page as PDF',
    defaultPath: path.join(os.homedir(), 'Documents', `${safeFileName(title)}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  }
  const choice = owner ? await dialog.showSaveDialog(owner, opts) : await dialog.showSaveDialog(opts)
  if (choice.canceled || !choice.filePath) return null
  const { win, cleanup } = await renderPage(html, title)
  try {
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    await fs.writeFile(choice.filePath, pdf)
    return choice.filePath
  } catch (err) {
    throw new EngineFailure('IO_ERROR', `Could not export the PDF: ${(err as Error).message}`)
  } finally {
    await cleanup()
  }
}
