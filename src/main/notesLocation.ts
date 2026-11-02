// Where the notes live: ~/Documents/justNotes/<Notebook>/<Section>/<Page>.md
// Earlier versions used ~/WikiBook/Notebooks; that folder is moved here once.

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_ROOT = path.join(os.homedir(), 'Documents', 'justNotes')
export const OLD_ROOT = path.join(os.homedir(), 'WikiBook', 'Notebooks')

const isDir = (p: string) =>
  fs.stat(p).then(
    (s) => s.isDirectory(),
    () => false
  )
const exists = (p: string) =>
  fs.lstat(p).then(
    () => true,
    () => false
  )

/**
 * Moves the old notes folder to the new location if the new one doesn't exist
 * yet. Never overwrites anything. Returns the folder to use: the new one, or
 * the old one if it could not be moved (so notes never seem to disappear).
 */
export async function migrateNotesFolder(newRoot = DEFAULT_ROOT, oldRoot = OLD_ROOT): Promise<{ root: string; moved: boolean }> {
  if ((await exists(newRoot)) || !(await isDir(oldRoot))) return { root: newRoot, moved: false }
  try {
    await fs.mkdir(path.dirname(newRoot), { recursive: true })
    await fs.rename(oldRoot, newRoot) // a single atomic step on the same drive
    // Tidy up the now-empty ~/WikiBook (only if nothing else is in it).
    await fs.rmdir(path.dirname(oldRoot)).catch(() => {})
    return { root: newRoot, moved: true }
  } catch (err) {
    console.error('Could not move the notes folder; still using', oldRoot, err)
    return { root: oldRoot, moved: false }
  }
}

/** The notes folder for this run (JUSTNOTES_ROOT overrides it, e.g. for testing). */
export async function resolveNotesRoot(): Promise<string> {
  const override = process.env.JUSTNOTES_ROOT || process.env.WIKIBOOK_ROOT
  if (override) return override
  return (await migrateNotesFolder()).root
}
