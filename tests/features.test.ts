import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EngineFailure, FileEngine } from '../src/main/fileEngine'

let root: string
let engine: FileEngine
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'jn-feat-'))
  engine = new FileEngine(path.join(root, 'notes'))
  await engine.createNotebook('N')
  await engine.createSection('N', 'S')
  await engine.createPage('N', 'S', 'P')
})
afterEach(() => fs.rm(root, { recursive: true, force: true }))
const code = (p: Promise<unknown>) => p.then(() => 'OK', (e) => (e instanceof EngineFailure ? e.code : String(e)))
const names = async () => (await engine.listTree()).notebooks.find((n) => n.name === 'N')!

describe('recycle bin', () => {
  it('deleting a page moves it (with whiteboard) to the bin; restore puts it back', async () => {
    await engine.writeCanvas('N', 'S', 'P', '{"elements":[]}')
    await engine.deletePage('N', 'S', 'P')
    expect((await names()).sections[0].pages).toEqual([])
    const bin = await engine.listTrash()
    expect(bin).toMatchObject([{ kind: 'page', notebook: 'N', section: 'S', page: 'P', pages: 1 }])
    expect(await engine.restoreFromTrash(bin[0].id)).toEqual({ notebook: 'N', section: 'S', page: 'P' })
    expect((await names()).sections[0].pages).toMatchObject([{ name: 'P', hasCanvas: true }])
    expect(await engine.listTrash()).toEqual([])
  })

  it('restores sections and notebooks, re-creating missing parents and avoiding name clashes', async () => {
    await engine.deleteSection('N', 'S', { force: true })
    await engine.createSection('N', 'S') // a new section took the name
    const [sec] = await engine.listTrash()
    expect(sec).toMatchObject({ kind: 'section', pages: 1 })
    expect(await engine.restoreFromTrash(sec.id)).toEqual({ notebook: 'N', section: 'S (restored)' })
    await engine.deleteNotebook('N', { force: true })
    const [nb] = await engine.listTrash()
    expect(nb).toMatchObject({ kind: 'notebook', pages: 1 })
    expect(await engine.restoreFromTrash(nb.id)).toEqual({ notebook: 'N' })
    expect((await names()).sections.map((s) => s.name)).toEqual(['S', 'S (restored)'])
  })

  it('a page whose section was deleted meanwhile is restored into a re-created section', async () => {
    await engine.deletePage('N', 'S', 'P')
    await engine.deleteSection('N', 'S', { force: true })
    const page = (await engine.listTrash()).find((t) => t.kind === 'page')!
    await engine.restoreFromTrash(page.id)
    expect((await names()).sections[0]).toMatchObject({ name: 'S', pages: [{ name: 'P' }] })
  })

  it('empties one item, everything, and items older than 30 days; rejects odd ids', async () => {
    await engine.deletePage('N', 'S', 'P')
    const [t] = await engine.listTrash()
    const meta = path.join(engine.root, '.trash', t.id, 'meta.json')
    await fs.writeFile(meta, JSON.stringify({ ...JSON.parse(await fs.readFile(meta, 'utf8')), deletedAt: new Date(Date.now() - 40 * 864e5).toISOString() }))
    expect(await engine.purgeOldTrash()).toBe(1)
    await engine.createPage('N', 'S', 'Q')
    await engine.deletePage('N', 'S', 'Q')
    await engine.emptyTrash((await engine.listTrash())[0].id)
    expect(await engine.listTrash()).toEqual([])
    expect(await code(engine.restoreFromTrash('../../etc'))).toBe('NOT_FOUND')
    expect(await code(engine.emptyTrash('../x'))).toBe('NOT_FOUND')
  })

  it('the bin is invisible in the tree and never blocks deleting', async () => {
    await engine.deletePage('N', 'S', 'P')
    expect((await engine.listTree()).notebooks.map((n) => n.name)).toEqual(['N'])
    expect(await code(engine.deleteSection('N', 'S'))).toBe('OK') // empty again (history/order files don't count)
  })
})

describe('custom order', () => {
  it('keeps the order you set, puts new and unknown items after it, and follows renames/moves/deletes', async () => {
    for (const p of ['A', 'B', 'C']) await engine.createPage('N', 'S', p)
    await engine.setOrder('N', 'S', ['C', 'P', 'A'])
    expect((await names()).sections[0].pages.map((p) => p.name)).toEqual(['C', 'P', 'A', 'B'])
    await engine.createPage('N', 'S', 'Zed')
    await engine.renamePage('N', 'S', 'P', 'Pea')
    expect((await names()).sections[0].pages.map((p) => p.name)).toEqual(['C', 'Pea', 'A', 'Zed', 'B'])
    await engine.deletePage('N', 'S', 'C')
    await engine.createSection('N', 'T')
    await engine.setOrder('N', null, ['T', 'S'])
    await engine.movePage('N', 'S', 'A', 'N', 'T')
    const nb = await names()
    expect(nb.sections.map((s) => s.name)).toEqual(['T', 'S'])
    expect(nb.sections[1].pages.map((p) => p.name)).toEqual(['Pea', 'Zed', 'B'])
    expect(await code(engine.setOrder('N', 'S', ['../x']))).toBe('INVALID_NAME')
    expect(await code(engine.setOrder('N', 'S', 'nope'))).toBe('INVALID_NAME')
  })
})

describe('duplicate, templates, append', () => {
  it('duplicates a page with its whiteboard and places the copy after it', async () => {
    await engine.writePage('N', 'S', 'P', '# P\n\nbody\n')
    await engine.writeCanvas('N', 'S', 'P', '{}')
    await engine.createPage('N', 'S', 'Q')
    await engine.setOrder('N', 'S', ['P', 'Q'])
    expect(await engine.duplicatePage('N', 'S', 'P')).toBe('P (copy)')
    expect(await engine.duplicatePage('N', 'S', 'P')).toBe('P (copy 2)')
    expect(await engine.readPage('N', 'S', 'P (copy)')).toBe('# P (copy)\n\nbody\n')
    expect((await names()).sections[0].pages.map((p) => [p.name, p.hasCanvas])).toEqual([['P', true], ['P (copy 2)', true], ['P (copy)', true], ['Q', false]])
  })

  it('creates a page from a template and appends to a page', async () => {
    await engine.createPage('N', 'S', 'Meeting', '# Meeting\n\n## Agenda\n\n- \n')
    expect(await engine.readPage('N', 'S', 'Meeting')).toContain('## Agenda')
    await engine.appendToPage('N', 'S', 'Meeting', '![Whiteboard](assets/wb.png)')
    expect(await engine.readPage('N', 'S', 'Meeting')).toBe('# Meeting\n\n## Agenda\n\n-\n\n![Whiteboard](assets/wb.png)\n')
  })
})

describe('page history', () => {
  it('keeps the previous text when saving (at most every 10 minutes) and restores it', async () => {
    await engine.writePage('N', 'S', 'P', '# P\n\nfirst\n') // previous text was the empty default: not kept
    await engine.writePage('N', 'S', 'P', '# P\n\nsecond\n') // keeps "first"
    await engine.writePage('N', 'S', 'P', '# P\n\nthird\n') // within 10 minutes: no new version
    let versions = await engine.listVersions('N', 'S', 'P')
    expect(versions.map((v) => v.preview)).toEqual(['first'])
    expect(await engine.restoreVersion('N', 'S', 'P', versions[0].id)).toBe('# P\n\nfirst\n')
    expect(await engine.readPage('N', 'S', 'P')).toBe('# P\n\nfirst\n')
    versions = await engine.listVersions('N', 'S', 'P')
    expect(versions.map((v) => v.preview).sort()).toEqual(['first', 'third']) // "third" was kept before restoring
    expect(await code(engine.readVersion('N', 'S', 'P', '../../x.md'))).toBe('NOT_FOUND')
  })

  it('history follows renames and moves, and goes to the bin with the page', async () => {
    await engine.writePage('N', 'S', 'P', '# P\n\none\n')
    await engine.writePage('N', 'S', 'P', '# P\n\ntwo\n')
    await engine.renamePage('N', 'S', 'P', 'R')
    expect(await engine.listVersions('N', 'S', 'R')).toHaveLength(1)
    await engine.createSection('N', 'T')
    await engine.movePage('N', 'S', 'R', 'N', 'T')
    expect(await engine.listVersions('N', 'T', 'R')).toHaveLength(1)
    await engine.deletePage('N', 'T', 'R')
    await engine.restoreFromTrash((await engine.listTrash())[0].id)
    expect(await engine.listVersions('N', 'T', 'R')).toHaveLength(1)
  })
})

describe('notebook backup', () => {
  it('exports a notebook to .zip and imports it back under a free name', async () => {
    await engine.writePage('N', 'S', 'P', '# P\n\nhello\n')
    await engine.saveAsset('N', 'S', 'pic.png', new Uint8Array([1, 2, 3]))
    await engine.setOrder('N', 'S', ['P'])
    const zip = await engine.exportNotebook('N')
    expect(await engine.importNotebook(zip, undefined)).toBe('N (restored)')
    const nb = (await engine.listTree()).notebooks.find((n) => n.name === 'N (restored)')!
    expect(nb.sections[0].pages.map((p) => p.name)).toEqual(['P'])
    expect(await engine.readPage('N (restored)', 'S', 'P')).toBe('# P\n\nhello\n')
    expect([...(await fs.readFile(path.join(engine.root, 'N (restored)', 'S', 'assets', 'pic.png')))]).toEqual([1, 2, 3])
  })

  it('import ignores anything outside the notebook or that is not a note', async () => {
    const evil = zipSync({
      'Box/S/Good.md': strToU8('# Good\n'),
      'Box/../../escape.md': strToU8('x'),
      'Box/S/run.sh': strToU8('rm -rf /'),
      'Box/S/deep/er/x.md': strToU8('too deep'),
      'Box/.hidden/x.md': strToU8('hidden')
    })
    expect(await engine.importNotebook(evil, undefined)).toBe('Box')
    const nb = (await engine.listTree()).notebooks.find((n) => n.name === 'Box')!
    expect(nb.sections.map((s) => [s.name, s.pages.map((p) => p.name)])).toEqual([['S', ['Good']]])
    expect(await fs.readdir(root)).toEqual(['notes'])
    expect(await code(engine.importNotebook(strToU8('not a zip'), 'x'))).toBe('IO_ERROR')
    expect(await code(engine.importNotebook(zipSync({ 'a.txt': strToU8('x') }), 'x'))).toBe('IO_ERROR')
  })
})

describe('section colors, notebook order, save a version now', () => {
  it('a section keeps its color through a rename; bad colors are refused', async () => {
    await engine.setSectionColor('N', 'S', '#E5A26B')
    expect((await names()).sections[0].color).toBe('#e5a26b')
    await engine.renameSection('N', 'S', 'S2')
    expect((await names()).sections[0]).toMatchObject({ name: 'S2', color: '#e5a26b' })
    expect(await code(engine.setSectionColor('N', 'S2', 'red; x'))).toBe('INVALID_NAME')
    await engine.setSectionColor('N', 'S2', null)
    expect((await names()).sections[0].color).toBeUndefined()
  })
  it('notebooks can be put in any order; new and renamed ones keep their place', async () => {
    await engine.createNotebook('A')
    await engine.createNotebook('Z')
    const order = async () => (await engine.listTree()).notebooks.map((n) => n.name)
    expect(await order()).toEqual(['A', 'N', 'Z'])
    await engine.setNotebookOrder(['Z', 'N', 'A'])
    expect(await order()).toEqual(['Z', 'N', 'A'])
    await engine.renameNotebook('N', 'M')
    await engine.createNotebook('B')
    expect(await order()).toEqual(['Z', 'M', 'A', 'B'])
    await engine.deleteNotebook('A')
    expect(await order()).toEqual(['Z', 'M', 'B'])
  })
  it('saves a version on request, even right after another', async () => {
    await engine.writePage('N', 'S', 'P', '# P\n\nfirst\n')
    expect(await engine.saveVersion('N', 'S', 'P')).toBe(true)
    await engine.writePage('N', 'S', 'P', '# P\n\nsecond\n')
    expect(await engine.saveVersion('N', 'S', 'P')).toBe(true)
    expect((await engine.listVersions('N', 'S', 'P')).length).toBeGreaterThanOrEqual(2)
  })
})

describe('subpages', () => {
  const levels = async () => (await names()).sections[0].pages.map((p) => `${p.name}:${p.level}`)
  beforeEach(async () => {
    for (const n of ['Q', 'R']) await engine.createPage('N', 'S', n)
    await engine.setOrder('N', 'S', ['P', 'Q', 'R'])
  })
  it('keeps levels, and a subpage is never more than one level under the page above', async () => {
    await engine.setPageLevels('N', 'S', { Q: 1, R: 2 })
    expect(await levels()).toEqual(['P:0', 'Q:1', 'R:2'])
    await engine.setOrder('N', 'S', ['R', 'P', 'Q']) // a subpage moved to the top becomes a page
    expect(await levels()).toEqual(['R:0', 'P:0', 'Q:1'])
    expect(await code(engine.setPageLevels('N', 'S', { Q: 3 }))).toBe('INVALID_NAME')
  })
  it('follows renames and copies, and forgets deleted or moved pages', async () => {
    await engine.setPageLevels('N', 'S', { Q: 1 })
    await engine.renamePage('N', 'S', 'Q', 'Q2')
    expect(await levels()).toEqual(['P:0', 'Q2:1', 'R:0'])
    const copy = await engine.duplicatePage('N', 'S', 'Q2')
    expect(await levels()).toEqual(['P:0', 'Q2:1', `${copy}:1`, 'R:0'])
    await engine.deletePage('N', 'S', 'Q2')
    await engine.deletePage('N', 'S', copy)
    await engine.createPage('N', 'S', 'Q2') // a new page with the old name starts as a normal page
    expect((await levels()).find((l) => l.startsWith('Q2'))).toBe('Q2:0')
  })
})
