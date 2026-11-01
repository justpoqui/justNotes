// Wires the file engine to IPC. Every handler returns a Result<T> instead of
// throwing, because Electron strips custom properties (like `code`) from errors
// that cross the IPC boundary.

import { ipcMain, shell } from 'electron'
import { EngineFailure, FileEngine } from './fileEngine'
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

export function registerIpc(engine: FileEngine): void {
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

    openRootFolder: async () => {
      await engine.ensureRoot()
      const err = await shell.openPath(engine.root)
      if (err) throw new EngineFailure('IO_ERROR', `Could not open the folder: ${err}`)
    }
  }

  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(`wiki:${name}`, (_event, ...args) => wrap(() => fn(...args) as Promise<unknown>))
  }
}
