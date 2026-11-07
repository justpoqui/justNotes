import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkBackupDir, runBackup } from '../src/main/autoBackup'
import { FileEngine } from '../src/main/fileEngine'

let tmp: string
let engine: FileEngine
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'jn-bk-'))
  engine = new FileEngine(path.join(tmp, 'notes'))
  await engine.createNotebook('Work')
  await engine.createSection('Work', 'S')
  await engine.createPage('Work', 'S', 'P', '# P\n\nhello\n')
  await engine.createNotebook('Home')
})
afterEach(() => fs.rm(tmp, { recursive: true, force: true }))

describe('automatic backups', () => {
  it('writes a dated folder with one zip per notebook that Restore can read back', async () => {
    const dir = path.join(tmp, 'backups')
    const r = await runBackup(engine, dir, 10, new Date(2026, 10, 6, 9))
    expect(r).toEqual({ folder: path.join(dir, 'justNotes backup 2026-11-06'), notebooks: 2 })
    expect((await fs.readdir(r.folder)).sort()).toEqual(['Home.zip', 'Work.zip'])
    const name = await engine.importNotebook(new Uint8Array(await fs.readFile(path.join(r.folder, 'Work.zip'))), 'Work')
    expect(await engine.readPage(name, 'S', 'P')).toBe('# P\n\nhello\n')
  })

  it('keeps only the newest folders and leaves other files alone', async () => {
    const dir = path.join(tmp, 'backups')
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, 'my own file.txt'), 'x')
    for (let d = 1; d <= 5; d++) await runBackup(engine, dir, 3, new Date(2026, 10, d))
    expect((await fs.readdir(dir)).sort()).toEqual(['justNotes backup 2026-11-03', 'justNotes backup 2026-11-04', 'justNotes backup 2026-11-05', 'my own file.txt'])
  })

  it('refuses a folder inside the notes folder', () => {
    expect(() => checkBackupDir(path.join(engine.root, 'x'), engine.root)).toThrow(/inside the notes folder/)
    expect(checkBackupDir('', engine.root)).toMatch(/justNotes Backups$/)
  })
})
