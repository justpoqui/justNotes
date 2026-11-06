// Automatic backups: one folder per day ("justNotes backup 2026-11-06") holding a .zip of
// each notebook, in the same format as File ▸ Back up, so File ▸ Restore backup can bring
// any of them back. Older backup folders beyond the number to keep are removed.

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { EngineFailure, type FileEngine } from './fileEngine'

export const DEFAULT_BACKUP_DIR = path.join(os.homedir(), 'Documents', 'justNotes Backups')
const PREFIX = 'justNotes backup '
const FOLDER = /^justNotes backup (\d{4}-\d{2}-\d{2})$/

export interface BackupResult {
  folder: string
  notebooks: number
}

const zipName = (notebook: string) => `${notebook.replace(/[\\/:*?"<>|]+/g, '-')}.zip`

/** The backup folder to use: absolute, and never inside the notes folder (it would back itself up). */
export function checkBackupDir(dir: unknown, notesRoot: string): string {
  const d = typeof dir === 'string' && dir.trim() ? path.resolve(dir.trim()) : DEFAULT_BACKUP_DIR
  const root = path.resolve(notesRoot)
  if (d === root || d.startsWith(root + path.sep)) throw new EngineFailure('INVALID_NAME', 'Backups can’t be kept inside the notes folder. Choose another folder.')
  return d
}

export async function runBackup(engine: FileEngine, dirRaw: unknown, keepRaw: unknown, now = new Date()): Promise<BackupResult> {
  const dir = checkBackupDir(dirRaw, engine.root)
  const keep = Math.max(1, Math.min(365, Math.floor(Number(keepRaw)) || 10))
  const p2 = (n: number) => String(n).padStart(2, '0')
  const folder = path.join(dir, `${PREFIX}${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`)
  const tree = await engine.listTree()
  try {
    await fs.mkdir(folder, { recursive: true })
    for (const nb of tree.notebooks) {
      const data = await engine.exportNotebook(nb.name)
      const file = path.join(folder, zipName(nb.name))
      const tmp = path.join(folder, `.${randomUUID()}.tmp`)
      await fs.writeFile(tmp, data)
      await fs.rename(tmp, file) // a half-written zip never replaces a good one
    }
    // Remove the oldest backup folders beyond `keep` (only folders this feature made).
    const days = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && FOLDER.test(e.name))
      .map((e) => e.name)
      .sort()
    for (const old of days.slice(0, Math.max(0, days.length - keep))) await fs.rm(path.join(dir, old), { recursive: true, force: true })
  } catch (err) {
    if (err instanceof EngineFailure) throw err
    const e = err as NodeJS.ErrnoException
    throw new EngineFailure('IO_ERROR', `Automatic backup failed: ${e?.code === 'EACCES' || e?.code === 'EPERM' ? 'permission denied for ' + dir : (e?.message ?? String(err))}`)
  }
  return { folder, notebooks: tree.notebooks.length }
}
