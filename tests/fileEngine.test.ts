import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EngineFailure, FileEngine, validateName } from '../src/main/fileEngine'
import { watchFolder } from '../src/main/watcher'

let root: string
let engine: FileEngine

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'wikibook-test-'))
  engine = new FileEngine(path.join(root, 'Notebooks'))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const exists = (...p: string[]) =>
  fs.stat(path.join(engine.root, ...p)).then(
    () => true,
    () => false
  )

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof EngineFailure) return e.code
    throw e
  }
  return 'OK'
}

describe('validateName', () => {
  it('trims and accepts normal names, including unicode and spaces', () => {
    expect(validateName('  Work Notes ', 'notebook')).toBe('Work Notes')
    expect(validateName('Café ☕ 2026', 'page')).toBe('Café ☕ 2026')
  })
  it('strips a trailing .md from page names', () => {
    expect(validateName('Todo.md', 'page')).toBe('Todo')
  })
  it.each(['', '   ', 'a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', '[[x]]', 'a#b', '.hidden', 'end.', '..', 'tab\there', 'x'.repeat(121)])(
    'rejects %j',
    (n) => {
      expect(() => validateName(n, 'section')).toThrowError(EngineFailure)
    }
  )
  it('rejects page names that would clash with whiteboard files', () => {
    expect(() => validateName('Plan.canvas', 'page')).toThrowError(/reserved/)
    for (const n of ['CON', 'nul', 'Com1', 'lpt9', 'aux.txt']) expect(() => validateName(n, 'page')).toThrowError(/Windows reserves/)
    for (const n of ['Console', 'Nullable', 'COM10', 'auxiliary']) expect(validateName(n, 'page')).toBe(n)
  })
})

describe('FileEngine', () => {
  it('creates the root folder and lists an empty tree', async () => {
    const tree = await engine.listTree()
    expect(tree.notebooks).toEqual([])
    expect(await exists()).toBe(true)
  })

  it('creates notebook → section → page on disk', async () => {
    await engine.createNotebook('Work')
    await engine.createSection('Work', 'Meetings')
    const page = await engine.createPage('Work', 'Meetings', 'Standup')
    expect(page.path).toBe(path.join(engine.root, 'Work', 'Meetings', 'Standup.md'))
    expect(await fs.readFile(page.path, 'utf8')).toBe('# Standup\n\n')

    const tree = await engine.listTree()
    expect(tree.notebooks.map((n) => n.name)).toEqual(['Work'])
    expect(tree.notebooks[0].sections[0].name).toBe('Meetings')
    expect(tree.notebooks[0].sections[0].pages.map((p) => p.name)).toEqual(['Standup'])
  })

  it('rejects duplicates, case-insensitively', async () => {
    await engine.createNotebook('Work')
    expect(await code(engine.createNotebook('Work'))).toBe('DUPLICATE')
    expect(await code(engine.createNotebook('work'))).toBe('DUPLICATE')
    await engine.createSection('Work', 'A')
    expect(await code(engine.createSection('Work', 'a'))).toBe('DUPLICATE')
    await engine.createPage('Work', 'A', 'Page')
    expect(await code(engine.createPage('Work', 'A', 'PAGE'))).toBe('DUPLICATE')
  })

  it('allows the same name at different levels / in different parents', async () => {
    await engine.createNotebook('One')
    await engine.createNotebook('Two')
    await engine.createSection('One', 'Ideas')
    await engine.createSection('Two', 'Ideas')
    await engine.createPage('One', 'Ideas', 'Ideas')
    await engine.createPage('Two', 'Ideas', 'Ideas')
    expect(await exists('Two', 'Ideas', 'Ideas.md')).toBe(true)
  })

  it('rejects invalid names on create and rename', async () => {
    expect(await code(engine.createNotebook('bad/name'))).toBe('INVALID_NAME')
    await engine.createNotebook('Ok')
    expect(await code(engine.renameNotebook('Ok', 'what?'))).toBe('INVALID_NAME')
    expect(await exists('Ok')).toBe(true)
  })

  it('cannot escape the root with path tricks', async () => {
    expect(await code(engine.createNotebook('..'))).toBe('INVALID_NAME')
    expect(await code(engine.deleteNotebook('..', { force: true }))).toBe('INVALID_NAME')
    expect(await code(engine.deleteNotebook('../..', { force: true }))).toBe('INVALID_NAME')
    expect(await code(engine.createSection('..', 'x'))).toBe('INVALID_NAME')
  })

  it('renames notebooks and sections, keeping contents', async () => {
    await engine.createNotebook('Old')
    await engine.createSection('Old', 'S')
    await engine.createPage('Old', 'S', 'P')
    await engine.renameNotebook('Old', 'New')
    await engine.renameSection('New', 'S', 'S2')
    expect(await exists('New', 'S2', 'P.md')).toBe(true)
    expect(await exists('Old')).toBe(false)
  })

  it('allows a case-only rename', async () => {
    await engine.createNotebook('work')
    await engine.renameNotebook('work', 'Work')
    expect((await engine.listTree()).notebooks.map((n) => n.name)).toEqual(['Work'])
  })

  it('rejects renaming onto an existing name', async () => {
    await engine.createNotebook('A')
    await engine.createNotebook('B')
    expect(await code(engine.renameNotebook('A', 'b'))).toBe('DUPLICATE')
  })

  it('renames a page, its whiteboard file and its default heading', async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await engine.createPage('N', 'S', 'Draft')
    await fs.writeFile(path.join(engine.root, 'N', 'S', 'Draft.canvas.json'), '{}')
    await engine.renamePage('N', 'S', 'Draft', 'Final')
    expect(await fs.readFile(path.join(engine.root, 'N', 'S', 'Final.md'), 'utf8')).toBe('# Final\n\n')
    expect(await exists('N', 'S', 'Final.canvas.json')).toBe(true)
    expect(await exists('N', 'S', 'Draft.md')).toBe(false)
    const page = (await engine.listTree()).notebooks[0].sections[0].pages[0]
    expect(page).toMatchObject({ name: 'Final', hasCanvas: true })
  })

  it('reports NOT_FOUND for things that do not exist', async () => {
    expect(await code(engine.renameNotebook('Ghost', 'X'))).toBe('NOT_FOUND')
    expect(await code(engine.createSection('Ghost', 'X'))).toBe('NOT_FOUND')
    await engine.createNotebook('N')
    expect(await code(engine.createPage('N', 'Ghost', 'X'))).toBe('NOT_FOUND')
    await engine.createSection('N', 'S')
    expect(await code(engine.deletePage('N', 'S', 'Ghost'))).toBe('NOT_FOUND')
  })

  it('deletes empty folders without confirmation', async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await engine.deleteSection('N', 'S')
    await engine.deleteNotebook('N')
    expect(await exists('N')).toBe(false)
  })

  it('refuses to delete non-empty folders unless forced, and reports contents', async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await engine.createPage('N', 'S', 'P1')
    await engine.createPage('N', 'S', 'P2')
    await fs.writeFile(path.join(engine.root, 'N', 'S', 'image.png'), '')

    const err = await engine.deleteNotebook('N').catch((e) => e)
    expect(err).toBeInstanceOf(EngineFailure)
    expect(err.code).toBe('NOT_EMPTY')
    expect(err.contents).toEqual({ sections: 1, pages: 2, otherFiles: 1 })
    expect(await exists('N', 'S', 'P1.md')).toBe(true)

    expect(await code(engine.deleteSection('N', 'S'))).toBe('NOT_EMPTY')
    await engine.deleteNotebook('N', { force: true })
    expect(await exists('N')).toBe(false)
  })

  it('deletes a page together with its whiteboard file', async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await engine.createPage('N', 'S', 'P')
    await fs.writeFile(path.join(engine.root, 'N', 'S', 'P.canvas.json'), '{}')
    await engine.deletePage('N', 'S', 'P')
    expect(await fs.readdir(path.join(engine.root, 'N', 'S'))).toEqual([])
  })

  it('can still rename/delete items created outside the app with unusual names', async () => {
    await fs.mkdir(path.join(engine.root, 'Odd: name'), { recursive: true })
    await engine.renameNotebook('Odd: name', 'Normal')
    expect(await exists('Normal')).toBe(true)
  })

  it('ignores hidden folders and non-.md files in the tree', async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await fs.mkdir(path.join(engine.root, '.git'))
    await fs.writeFile(path.join(engine.root, 'N', 'S', 'notes.txt'), '')
    await engine.createPage('N', 'S', 'Real')
    const tree = await engine.listTree()
    expect(tree.notebooks.map((n) => n.name)).toEqual(['N'])
    expect(tree.notebooks[0].sections[0].pages.map((p) => p.name)).toEqual(['Real'])
  })

  it('rename returns the final, cleaned-up name', async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await engine.createPage('N', 'S', 'P')
    expect(await engine.renamePage('N', 'S', 'P', '  Renamed.md ')).toBe('Renamed')
    expect(await engine.renameNotebook('N', ' Notebook ')).toBe('Notebook')
  })

  it('reads page contents', async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await engine.createPage('N', 'S', 'P')
    expect(await engine.readPage('N', 'S', 'P')).toBe('# P\n\n')
    expect(await code(engine.readPage('N', 'S', 'Nope'))).toBe('NOT_FOUND')
  })

  it('locates items for "show in file manager"', async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await engine.createPage('N', 'S', 'P')
    expect(await engine.locate({ notebook: 'N' })).toBe(path.join(engine.root, 'N'))
    expect(await engine.locate({ notebook: 'N', section: 'S', page: 'P' })).toBe(path.join(engine.root, 'N', 'S', 'P.md'))
    expect(await code(engine.locate({ notebook: 'N', section: 'Gone' }))).toBe('NOT_FOUND')
    expect(await code(engine.locate({ notebook: '..' }))).toBe('INVALID_NAME')
  })
})

describe('FileEngine — editing (Phase 3)', () => {
  beforeEach(async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await engine.createPage('N', 'S', 'P')
  })

  it('writes page content and leaves no temp files behind', async () => {
    await engine.writePage('N', 'S', 'P', '# P\n\nHello\n')
    expect(await engine.readPage('N', 'S', 'P')).toBe('# P\n\nHello\n')
    expect(await fs.readdir(path.join(engine.root, 'N', 'S'))).toEqual(['P.md'])
  })

  it('refuses to re-create a page that was deleted', async () => {
    await engine.deletePage('N', 'S', 'P')
    expect(await code(engine.writePage('N', 'S', 'P', 'x'))).toBe('NOT_FOUND')
    expect(await exists('N', 'S', 'P.md')).toBe(false)
  })

  it('saves images into assets/ without overwriting', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71])
    expect(await engine.saveAsset('N', 'S', 'photo.png', bytes)).toBe('assets/photo.png')
    expect(await engine.saveAsset('N', 'S', 'photo.png', bytes)).toBe('assets/photo-1.png')
    expect(await engine.saveAsset('N', 'S', '../../evil name?.PNG', bytes)).toBe('assets/evil name.png')
    expect([...(await fs.readFile(path.join(engine.root, 'N', 'S', 'assets', 'photo.png')))]).toEqual([...bytes])
    // the assets folder is not shown as a page or section
    const tree = await engine.listTree()
    expect(tree.notebooks[0].sections.map((s) => s.name)).toEqual(['S'])
    expect(tree.notebooks[0].sections[0].pages.map((p) => p.name)).toEqual(['P'])
  })

  it('rejects non-image assets', async () => {
    expect(await code(engine.saveAsset('N', 'S', 'script.sh', new Uint8Array([1])))).toBe('INVALID_NAME')
  })

  it('only resolves image paths inside the root', () => {
    expect(engine.resolveAsset('N/S/assets/a.png')).toBe(path.join(engine.root, 'N', 'S', 'assets', 'a.png'))
    expect(() => engine.resolveAsset('../../etc/passwd.png')).toThrow(EngineFailure)
    expect(() => engine.resolveAsset('N/S/P.md')).toThrow(EngineFailure)
  })
})

describe('FileEngine — whiteboards', () => {
  beforeEach(async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await engine.createPage('N', 'S', 'P')
  })

  it('has no whiteboard until one is saved', async () => {
    expect(await engine.readCanvas('N', 'S', 'P')).toBeNull()
  })

  it('saves <Page>.canvas.json next to the page and reports it in the tree', async () => {
    await engine.writeCanvas('N', 'S', 'P', '{"type":"excalidraw","elements":[]}')
    expect(await engine.readCanvas('N', 'S', 'P')).toBe('{"type":"excalidraw","elements":[]}')
    expect((await fs.readdir(path.join(engine.root, 'N', 'S'))).sort()).toEqual(['P.canvas.json', 'P.md'])
    expect((await engine.listTree()).notebooks[0].sections[0].pages[0].hasCanvas).toBe(true)
  })

  it('will not create an orphan whiteboard for a missing page', async () => {
    await engine.deletePage('N', 'S', 'P')
    expect(await code(engine.writeCanvas('N', 'S', 'P', '{}'))).toBe('NOT_FOUND')
    expect(await fs.readdir(path.join(engine.root, 'N', 'S'))).toEqual([])
  })
})

describe('FileEngine — moving pages', () => {
  beforeEach(async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'A')
    await engine.createSection('N', 'B')
    await engine.createNotebook('M')
    await engine.createSection('M', 'C')
    await engine.createPage('N', 'A', 'P')
  })
  const dir = (...p: string[]) => path.join(engine.root, ...p)

  it('moves a page with its whiteboard to another section', async () => {
    await engine.writePage('N', 'A', 'P', '# P\n\nhello\n')
    await engine.writeCanvas('N', 'A', 'P', '{"elements":[]}')
    expect(await engine.movePage('N', 'A', 'P', 'N', 'B')).toBe('P')
    expect(await fs.readdir(dir('N', 'A'))).toEqual([])
    expect((await fs.readdir(dir('N', 'B'))).sort()).toEqual(['P.canvas.json', 'P.md'])
    expect(await engine.readPage('N', 'B', 'P')).toBe('# P\n\nhello\n')
  })

  it('moves to another notebook, copying the images it uses', async () => {
    const png = new Uint8Array([1, 2, 3])
    const rel = await engine.saveAsset('N', 'A', 'my pic.png', png)
    await engine.saveAsset('N', 'A', 'unused.png', png)
    await engine.writePage('N', 'A', 'P', `# P\n\n![](${encodeURI(rel)})\n\n![x](./assets/my%20pic.png)\n`)
    // an image with the same name but different content already exists at the destination
    await fs.mkdir(dir('M', 'C', 'assets'))
    await fs.writeFile(dir('M', 'C', 'assets', 'my pic.png'), 'other')
    await engine.movePage('N', 'A', 'P', 'M', 'C')
    expect(await engine.readPage('M', 'C', 'P')).toBe('# P\n\n![](assets/my%20pic-1.png)\n\n![x](./assets/my%20pic-1.png)\n')
    expect([...(await fs.readFile(dir('M', 'C', 'assets', 'my pic-1.png')))]).toEqual([1, 2, 3])
    expect(await fs.readdir(dir('N', 'A', 'assets'))).toContain('my pic.png') // originals kept
    expect(await fs.readdir(dir('M', 'C', 'assets'))).not.toContain('unused.png')
  })

  it('refuses duplicates and no-op moves without changing anything', async () => {
    await engine.createPage('N', 'B', 'p')
    expect(await code(engine.movePage('N', 'A', 'P', 'N', 'B'))).toBe('DUPLICATE')
    expect(await code(engine.movePage('N', 'A', 'P', 'N', 'A'))).toBe('INVALID_NAME')
    expect(await code(engine.movePage('N', 'A', 'P', 'N', 'Nope'))).toBe('NOT_FOUND')
    expect(await fs.readdir(dir('N', 'A'))).toEqual(['P.md'])
  })
})

describe('watchFolder', () => {
  it('reports changes anywhere under the root, debounced', async () => {
    await engine.ensureRoot()
    let calls = 0
    const stop = watchFolder(engine.root, () => calls++, 50)
    await new Promise((r) => setTimeout(r, 50))
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await fs.writeFile(path.join(engine.root, 'N', 'S', 'x.md'), 'hi')
    await new Promise((r) => setTimeout(r, 300))
    stop()
    expect(calls).toBe(1)
  })
})

describe('crash leftovers', () => {
  it('removes old temp files from interrupted saves, but not recent ones', async () => {
    await engine.createNotebook('N')
    await engine.createSection('N', 'S')
    await engine.createPage('N', 'S', 'P')
    const dir = path.join(engine.root, 'N', 'S')
    await fs.writeFile(path.join(dir, '.P.md.1a2b3c4d.tmp'), 'half')
    await fs.writeFile(path.join(dir, '.P.md.9f8e7d6c.tmp'), 'in progress')
    const old = new Date(Date.now() - 5 * 60_000)
    await fs.utimes(path.join(dir, '.P.md.1a2b3c4d.tmp'), old, old)
    expect(await engine.cleanupTempFiles()).toBe(1)
    expect((await fs.readdir(dir)).sort()).toEqual(['.P.md.9f8e7d6c.tmp', 'P.md'])
  })
})

