import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { migrateNotesFolder } from '../src/main/notesLocation'

let home: string
beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'jn-home-'))
})
afterEach(() => fs.rm(home, { recursive: true, force: true }))

const oldRoot = () => path.join(home, 'WikiBook', 'Notebooks')
const newRoot = () => path.join(home, 'Documents', 'justNotes')

it('moves ~/WikiBook/Notebooks to ~/Documents/justNotes and removes the empty WikiBook folder', async () => {
  await fs.mkdir(path.join(oldRoot(), 'Work', 'Ideas'), { recursive: true })
  await fs.writeFile(path.join(oldRoot(), 'Work', 'Ideas', 'Plan.md'), '# Plan\n')
  expect(await migrateNotesFolder(newRoot(), oldRoot())).toEqual({ root: newRoot(), moved: true })
  expect(await fs.readFile(path.join(newRoot(), 'Work', 'Ideas', 'Plan.md'), 'utf8')).toBe('# Plan\n')
  expect(await fs.readdir(home)).toEqual(['Documents'])
})

it('keeps ~/WikiBook if something else is in it', async () => {
  await fs.mkdir(oldRoot(), { recursive: true })
  await fs.writeFile(path.join(home, 'WikiBook', 'other.txt'), 'x')
  await migrateNotesFolder(newRoot(), oldRoot())
  expect(await fs.readdir(path.join(home, 'WikiBook'))).toEqual(['other.txt'])
})

it('never touches anything when the new folder already exists', async () => {
  await fs.mkdir(path.join(oldRoot(), 'Old'), { recursive: true })
  await fs.mkdir(path.join(newRoot(), 'New'), { recursive: true })
  expect(await migrateNotesFolder(newRoot(), oldRoot())).toEqual({ root: newRoot(), moved: false })
  expect(await fs.readdir(oldRoot())).toEqual(['Old'])
  expect(await fs.readdir(newRoot())).toEqual(['New'])
})

it('does nothing on a fresh install', async () => {
  expect(await migrateNotesFolder(newRoot(), oldRoot())).toEqual({ root: newRoot(), moved: false })
  expect(await fs.readdir(home)).toEqual([])
})
