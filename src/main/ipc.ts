// Wires the file engine to IPC. Every handler returns a Result<T> instead of
// throwing, because Electron strips custom properties (like `code`) from errors
// that cross the IPC boundary.

import { BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { EngineFailure, FileEngine, IMAGE_EXTS } from './fileEngine'
import { exportPdf, printPage } from './printing'
import type { Result } from '../shared/types'

async function wrap<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    if (err instanceof EngineFailure) return { ok: false, error: err.toJSON() }
    console.error(err)
    return { ok: false, error: { code: 'IO_ERROR', message: err instanceof Error ? err.message : String(err) } }
  }
}

let fontCache: Promise<string[]> | null = null
/** Font families installed on this computer (from fontconfig, so nothing is downloaded). */
function listFonts(): Promise<string[]> {
  fontCache ??= new Promise((resolve) =>
    execFile('fc-list', [':', 'family'], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve([])
      const names = new Set<string>()
      for (const line of out.split('\n')) {
        const name = line.split(',')[0].trim()
        if (name && !name.startsWith('.') && /^[\w\s.()-]+$/.test(name)) names.add(name)
      }
      resolve([...names].sort((a, b) => a.localeCompare(b)).slice(0, 400))
    })
  )
  return fontCache
}

export function registerIpc(engine: FileEngine): void {
  // Cut / copy / paste for the editor's right-click menu.
  ipcMain.on('edit:command', (e, cmd: string) => {
    if (cmd === 'cut') e.sender.cut()
    else if (cmd === 'copy') e.sender.copy()
    else if (cmd === 'paste') e.sender.paste()
    else if (cmd === 'selectAll') e.sender.selectAll()
  })

  const handlers: Record<string, (...args: any[]) => unknown> = {
    getRoot: () => engine.root,
    listTree: () => engine.listTree(),

    createNotebook: (name) => engine.createNotebook(name),
    renameNotebook: (oldName, newName) => engine.renameNotebook(oldName, newName),
    deleteNotebook: (name, opts) => engine.deleteNotebook(name, { force: opts?.force === true }),

    createSection: (nb, name) => engine.createSection(nb, name),
    renameSection: (nb, oldName, newName) => engine.renameSection(nb, oldName, newName),
    deleteSection: (nb, name, opts) => engine.deleteSection(nb, name, { force: opts?.force === true }),

    createPage: (nb, sec, name) => engine.createPage(nb, sec, name),
    renamePage: (nb, sec, oldName, newName) => engine.renamePage(nb, sec, oldName, newName),
    deletePage: (nb, sec, name) => engine.deletePage(nb, sec, name),
    movePage: (nb, sec, name, toNb, toSec) => engine.movePage(nb, sec, name, toNb, toSec),
    readPage: (nb, sec, name) => engine.readPage(nb, sec, name),
    writePage: (nb, sec, name, content) => engine.writePage(nb, sec, name, content),
    readCanvas: (nb, sec, name) => engine.readCanvas(nb, sec, name),
    writeCanvas: (nb, sec, name, content) => engine.writeCanvas(nb, sec, name, content),
    setTheme: (theme) => {
      nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'
      for (const w of BrowserWindow.getAllWindows()) w.setBackgroundColor(theme === 'light' ? '#ffffff' : '#1e1f22')
    },
    saveAsset: (nb, sec, fileName, data) => engine.saveAsset(nb, sec, fileName, data),
    pickImage: async (nb, sec) => {
      const win = BrowserWindow.getFocusedWindow()
      const opts = {
        title: 'Insert image',
        properties: ['openFile' as const],
        filters: [{ name: 'Images', extensions: [...IMAGE_EXTS].map((e) => e.slice(1)) }]
      }
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (r.canceled || r.filePaths.length === 0) return null
      const file = r.filePaths[0]
      return engine.saveAsset(nb, sec, path.basename(file), await fs.readFile(file))
    },

    exportPdf: (html, title) => exportPdf(BrowserWindow.getFocusedWindow(), String(html), String(title)),
    printPage: (html, title) => printPage(String(html), String(title)),
    listFonts: () => listFonts(),
    openRootFolder: async () => {
      await engine.ensureRoot()
      const err = await shell.openPath(engine.root)
      if (err) throw new EngineFailure('IO_ERROR', `Could not open the folder: ${err}`)
    },
    showInFolder: async (ref) => {
      shell.showItemInFolder(await engine.locate(ref))
    }
  }

  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(`wiki:${name}`, (_event, ...args) => wrap(() => fn(...args) as Promise<unknown>))
  }
}
