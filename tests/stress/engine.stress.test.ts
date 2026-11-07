// Stress tests for the file engine. Not part of `npm test` (they take a while):
//   npm run test:stress
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FileEngine } from '../../src/main/fileEngine'
import { watchFolder } from '../../src/main/watcher'

let root: string
let engine: FileEngine
const ms = (t: number) => Math.round(performance.now() - t)
const report: string[] = []
const note = (s: string) => {
  report.push(s)
  console.log('  ' + s)
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'jn-stress-'))
  engine = new FileEngine(path.join(root, 'notes'))
  await engine.ensureRoot()
})
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
  await fs.writeFile(path.join(os.tmpdir(), 'jn-stress-report.txt'), report.join('\n') + '\n')
})

describe('scale', () => {
  it('handles 20 notebooks × 10 sections × 50 pages (10,000 pages)', async () => {
    let t = performance.now()
    for (let n = 0; n < 20; n++) {
      await engine.createNotebook(`Notebook ${n}`)
      for (let s = 0; s < 10; s++) {
        await engine.createSection(`Notebook ${n}`, `Section ${s}`)
        await Promise.all(Array.from({ length: 50 }, (_, p) => engine.createPage(`Notebook ${n}`, `Section ${s}`, `Page ${p}`)))
      }
    }
    note(`create 10,000 pages: ${ms(t)} ms`)
    t = performance.now()
    const tree = await engine.listTree()
    const listMs = ms(t)
    note(`list the whole tree (10,000 pages): ${listMs} ms`)
    expect(tree.notebooks).toHaveLength(20)
    expect(tree.notebooks.reduce((a, nb) => a + nb.sections.reduce((b, s) => b + s.pages.length, 0), 0)).toBe(10000)
    expect(listMs).toBeLessThan(3000)
  }, 240_000)

  it('renames and deletes a big notebook quickly', async () => {
    let t = performance.now()
    await engine.renameNotebook('Notebook 0', 'Renamed')
    note(`rename notebook with 500 pages: ${ms(t)} ms`)
    t = performance.now()
    await engine.deleteNotebook('Renamed', { force: true })
    note(`delete notebook with 500 pages: ${ms(t)} ms`)
    expect((await engine.listTree()).notebooks).toHaveLength(19)
  }, 60_000)
})

describe('big content', () => {
  it('writes and reads a 5 MB page', async () => {
    const big = '# Big\n\n' + Array.from({ length: 50000 }, (_, i) => `Paragraph ${i} with some ordinary words in it for size.`).join('\n\n') + '\n'
    let t = performance.now()
    await engine.writePage('Notebook 1', 'Section 0', 'Page 0', big)
    note(`write ${(big.length / 1e6).toFixed(1)} MB page: ${ms(t)} ms`)
    t = performance.now()
    expect(await engine.readPage('Notebook 1', 'Section 0', 'Page 0')).toBe(big)
    note(`read it back: ${ms(t)} ms`)
  })

  it('saves a 10 MB image and refuses a 30 MB one', async () => {
    await engine.saveAsset('Notebook 1', 'Section 0', 'big.png', new Uint8Array(10 * 1024 * 1024))
    await expect(engine.saveAsset('Notebook 1', 'Section 0', 'huge.png', new Uint8Array(30 * 1024 * 1024))).rejects.toThrow(/at most/)
  })
})

describe('concurrency', () => {
  it('200 overlapping saves to one page: the file is always complete and ends as one of the versions', async () => {
    const versions = Array.from({ length: 200 }, (_, i) => `# Page 1\n\n${'v' + i + ' '.repeat(1)}`.repeat(200 + i) + '\n')
    let reads = 0
    let torn = 0
    let stop = false
    const reader = (async () => {
      while (!stop) {
        const text = await engine.readPage('Notebook 1', 'Section 0', 'Page 1').catch(() => null)
        if (text !== null) {
          reads++
          if (!versions.includes(text) && text !== '# Page 1\n\n') torn++
        }
      }
    })()
    const t = performance.now()
    await Promise.all(versions.map((v) => engine.writePage('Notebook 1', 'Section 0', 'Page 1', v)))
    stop = true
    await reader
    note(`200 concurrent saves: ${ms(t)} ms; ${reads} reads during them, ${torn} half-written`)
    expect(torn).toBe(0)
    expect(versions).toContain(await engine.readPage('Notebook 1', 'Section 0', 'Page 1'))
    const leftovers = (await fs.readdir(path.join(engine.root, 'Notebook 1', 'Section 0'))).filter((f) => f.endsWith('.tmp'))
    expect(leftovers).toEqual([])
  }, 60_000)

  it('parallel creates with the same name: exactly one wins', async () => {
    const results = await Promise.allSettled(Array.from({ length: 50 }, () => engine.createPage('Notebook 2', 'Section 0', 'Race')))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const races = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => engine.createPage('Notebook 2', 'Section 0', i % 2 ? 'case' : 'CASE')))
    expect(races.filter((r) => r.status === 'fulfilled')).toHaveLength(1) // the duplicate check is case-insensitive
    note(`race: ${races.filter((r) => r.status === 'fulfilled').length} of "case"/"CASE" created`)
  })

  it('moving pages while also saving them never loses a page', async () => {
    await engine.createSection('Notebook 3', 'Target')
    const ops = Array.from({ length: 50 }, (_, p) =>
      Promise.allSettled([engine.writePage('Notebook 3', 'Section 0', `Page ${p}`, `# Page ${p}\n\nedited\n`), engine.movePage('Notebook 3', 'Section 0', `Page ${p}`, 'Notebook 3', 'Target')])
    )
    await Promise.all(ops)
    const tree = await engine.listTree()
    const nb = tree.notebooks.find((n) => n.name === 'Notebook 3')!
    const count = nb.sections.find((s) => s.name === 'Section 0')!.pages.length + nb.sections.find((s) => s.name === 'Target')!.pages.length
    expect(count).toBe(50)
  })
})

describe('outside changes', () => {
  it('the folder watcher copes with 1,000 files appearing at once (debounced to a few events)', async () => {
    let events = 0
    const stop = watchFolder(engine.root, () => events++, 150)
    await new Promise((r) => setTimeout(r, 100))
    await fs.mkdir(path.join(engine.root, 'Dropped', 'Bulk'), { recursive: true })
    await Promise.all(Array.from({ length: 1000 }, (_, i) => fs.writeFile(path.join(engine.root, 'Dropped', 'Bulk', `f${i}.md`), `# f${i}\n`)))
    await new Promise((r) => setTimeout(r, 1000))
    stop()
    note(`1,000 files written by another program → ${events} refresh event(s)`)
    expect(events).toBeGreaterThan(0)
    expect(events).toBeLessThan(10)
    const bulk = (await engine.listTree()).notebooks.find((n) => n.name === 'Dropped')!.sections[0]
    expect(bulk.pages).toHaveLength(1000)
  })
})

describe('odd names', () => {
  it.each(['Ünïcødé ñotes', '日本語のページ', '🎉 Party plans', 'a'.repeat(120), "Tom's \"notes\" (v2) & more", 'Spaces   inside', 'trailing-dash-'])('accepts %s', async (name) => {
    const clean = name.replace(/["]/g, '')
    if (/["]/.test(name)) return expect(engine.createPage('Notebook 4', 'Section 0', name)).rejects.toThrow()
    await engine.createPage('Notebook 4', 'Section 0', clean)
    expect(await engine.readPage('Notebook 4', 'Section 0', clean.trim())).toContain('# ')
  })
})
