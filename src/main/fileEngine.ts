// The file engine: the only code that touches the WikiBook folder on disk.
//
// Layout:  <root>/<Notebook>/<Section>/<Page>.md
//          <root>/<Notebook>/<Section>/<Page>.canvas.json   (whiteboard, Phase 5)
//
// Every page is a plain Markdown file and folders are the hierarchy, so the
// notes stay readable without the app.

import { randomUUID } from 'node:crypto'
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  DeleteOptions,
  PageVersion,
  TrashItem,
  EngineError,
  ErrorCode,
  ItemRef,
  NotebookInfo,
  PageInfo,
  SectionInfo,
  Tree
} from '../shared/types'

export const PAGE_EXT = '.md'
export const CANVAS_EXT = '.canvas.json'
const MAX_NAME_LENGTH = 120
/** Images pasted or inserted into a page are stored in <Section>/assets/. */
export const ASSETS_DIR = 'assets'
export const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif'])
const MAX_ASSET_BYTES = 25 * 1024 * 1024
/** Hidden folders / files the app keeps inside the notes folder. */
export const TRASH_DIR = '.trash'
export const HISTORY_DIR = '.history'
export const ORDER_FILE = '.order.json'
/** Each notebook's section colors: { "Section": "#e5a26b" }. */
export const COLORS_FILE = '.colors.json'
const COLOR = /^#[0-9a-f]{6}$/i
const TRASH_KEEP_DAYS = 30
const HISTORY_EVERY_MS = 10 * 60 * 1000
const HISTORY_KEEP = 50
const VERSION_ID = /^\d{8}-\d{6}(-\d+)?\.md$/
const TRASH_ID = /^\d{13}-[0-9a-f]{8}$/

/**
 * A unique hidden temp file next to `file` (saves write here first, then rename
 * over the real file). Unique per call, so overlapping saves never collide.
 */
const tempPathFor = (file: string) => path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID().slice(0, 8)}.tmp`)
/** Leftover temp files from a crash look like this. */
export const TEMP_FILE = /^\..+\.[0-9a-f]{8}\.tmp$/

/** An error with a code the UI can react to. */
export class EngineFailure extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public contents?: EngineError['contents']
  ) {
    super(message)
  }

  toJSON(): EngineError {
    return { code: this.code, message: this.message, contents: this.contents }
  }
}

type Kind = 'notebook' | 'section' | 'page'

// Characters rejected in names:
//  / \ : * ? " < > |   invalid on Linux (/) or on Windows/USB drives/cloud sync (the rest)
//  [ ] #               reserved for [[Wiki Links]] and [[Page#Heading]] (Phase 4)
//  control characters
const FORBIDDEN_CHARS = /[\/\\:*?"<>|\[\]#\u0000-\u001f\u007f]/

/**
 * Checks a user-supplied name and returns it trimmed.
 * Throws INVALID_NAME with a human-readable reason if it can't be used.
 */
export function validateName(raw: unknown, kind: Kind): string {
  if (typeof raw !== 'string') throw new EngineFailure('INVALID_NAME', `The ${kind} name must be text.`)
  let name = raw.trim()
  if (kind === 'page' && name.toLowerCase().endsWith(PAGE_EXT)) name = name.slice(0, -PAGE_EXT.length).trim()

  const bad = (why: string): never => {
    throw new EngineFailure('INVALID_NAME', `"${raw}" can't be used as a ${kind} name: ${why}`)
  }
  if (name === '') bad('the name is empty.')
  if (name.length > MAX_NAME_LENGTH) bad(`names can be at most ${MAX_NAME_LENGTH} characters.`)
  const ch = name.match(FORBIDDEN_CHARS)
  if (ch) {
    const shown = /[\u0000-\u001f\u007f]/.test(ch[0]) ? 'control characters' : `"${ch[0]}"`
    bad(`${shown} is not allowed. Avoid / \\ : * ? " < > | [ ] #`)
  }
  if (name.startsWith('.')) bad('names cannot start with a dot (those are hidden files).')
  if (name.endsWith('.')) bad('names cannot end with a dot.')
  if (kind === 'page' && name.toLowerCase().endsWith('.canvas')) bad('".canvas" is reserved for whiteboard files.')
  return name
}

/**
 * Light check for names that refer to something that already exists (it may have
 * been created outside the app, so the stricter new-name rules don't apply).
 * It only has to keep the path inside its folder.
 */
export function existingName(raw: unknown, kind: Kind): string {
  if (typeof raw !== 'string' || raw === '' || raw === '.' || raw === '..' || /[\/\\\u0000]/.test(raw)) {
    throw new EngineFailure('INVALID_NAME', `Invalid ${kind} reference.`)
  }
  return raw
}

const sameName = (a: string, b: string): boolean => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

/** Items listed in `order` come first, in that order; anything else follows alphabetically. */
function sortByOrder<T extends { name: string }>(items: T[], order: string[]): T[] {
  const rank = new Map(order.map((n, i) => [n, i]))
  return [...items].sort((a, b) => {
    const ra = rank.get(a.name)
    const rb = rank.get(b.name)
    if (ra !== undefined && rb !== undefined) return ra - rb
    if (ra !== undefined) return -1
    if (rb !== undefined) return 1
    return byName(a, b)
  })
}

function wrapIo(err: unknown, what: string): never {
  if (err instanceof EngineFailure) throw err
  const e = err as NodeJS.ErrnoException
  if (e?.code === 'ENOENT') throw new EngineFailure('NOT_FOUND', `${what}: it no longer exists on disk.`)
  if (e?.code === 'EEXIST') throw new EngineFailure('DUPLICATE', `${what}: something with that name already exists.`)
  if (e?.code === 'EACCES' || e?.code === 'EPERM') throw new EngineFailure('IO_ERROR', `${what}: permission denied.`)
  throw new EngineFailure('IO_ERROR', `${what}: ${e?.message ?? String(err)}`)
}

export class FileEngine {
  readonly root: string

  constructor(root: string) {
    this.root = path.resolve(root)
    // Changes to the folder structure run one at a time, so two at once can't both pass
    // the duplicate-name check (e.g. "Ideas" and "ideas" created in the same instant).
    for (const m of [
      'createNotebook', 'renameNotebook', 'deleteNotebook', 'createSection', 'renameSection', 'deleteSection',
      'createPage', 'renamePage', 'movePage', 'deletePage', 'duplicatePage', 'setOrder', 'setNotebookOrder', 'setSectionColor', 'restoreFromTrash',
      'emptyTrash', 'importNotebook', 'restoreVersion'
    ] as const) {
      const original = (this[m] as (...args: unknown[]) => Promise<unknown>).bind(this)
      ;(this as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => this.exclusive(() => original(...args))
    }
  }

  private queue: Promise<unknown> = Promise.resolve()
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => {})
    return run
  }

  /**
   * Removes temp files left behind if the app was killed in the middle of a save
   * (only ones older than a minute, so a save in progress is never touched).
   */
  async cleanupTempFiles(): Promise<number> {
    let removed = 0
    const sweep = async (dir: string, depth: number): Promise<void> => {
      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory() && depth < 2 && !e.name.startsWith('.')) await sweep(full, depth + 1)
        else if (e.isFile() && TEMP_FILE.test(e.name)) {
          const st = await fs.stat(full).catch(() => null)
          if (st && Date.now() - st.mtimeMs > 60_000) {
            await fs.rm(full, { force: true })
            removed++
          }
        }
      }
    }
    await sweep(this.root, 0)
    return removed
  }

  // ---------- paths ----------

  /** Joins path parts under the root and refuses anything that escapes it. */
  private inside(...parts: string[]): string {
    const p = path.resolve(this.root, ...parts)
    if (p !== this.root && !p.startsWith(this.root + path.sep)) {
      throw new EngineFailure('INVALID_NAME', 'That path points outside the justNotes folder.')
    }
    return p
  }

  private notebookDir(nb: string): string {
    return this.inside(nb)
  }
  private sectionDir(nb: string, sec: string): string {
    return this.inside(nb, sec)
  }
  private pageFile(nb: string, sec: string, page: string): string {
    return this.inside(nb, sec, page + PAGE_EXT)
  }
  private canvasFile(nb: string, sec: string, page: string): string {
    return this.inside(nb, sec, page + CANVAS_EXT)
  }

  private async isDir(p: string): Promise<boolean> {
    try {
      return (await fs.stat(p)).isDirectory()
    } catch {
      return false
    }
  }

  private async isFile(p: string): Promise<boolean> {
    try {
      return (await fs.stat(p)).isFile()
    } catch {
      return false
    }
  }

  private async requireDir(p: string, label: string): Promise<void> {
    if (!(await this.isDir(p))) throw new EngineFailure('NOT_FOUND', `${label} was not found on disk.`)
  }

  /** Names of every entry in a folder that a new item could collide with. */
  private async entryNames(dir: string): Promise<string[]> {
    try {
      return await fs.readdir(dir)
    } catch (err) {
      wrapIo(err, 'Reading folder')
    }
  }

  /**
   * Duplicate check, case-insensitive so "Work" and "work" can't both exist
   * (that would be confusing, and breaks on case-insensitive drives).
   * `except` is the item being renamed, so changing only its case is allowed.
   */
  private async assertFree(
    dir: string,
    fileName: string,
    label: (existing: string) => string,
    except?: string
  ): Promise<void> {
    for (const entry of await this.entryNames(dir)) {
      if (except !== undefined && entry === except) continue
      if (sameName(entry, fileName)) throw new EngineFailure('DUPLICATE', `${label(entry)} already exists.`)
    }
  }

  // ---------- reading ----------

  async ensureRoot(): Promise<void> {
    try {
      await fs.mkdir(this.root, { recursive: true })
    } catch (err) {
      wrapIo(err, `Creating ${this.root}`)
    }
  }

  private async subdirs(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)
  }

  async listTree(): Promise<Tree> {
    await this.ensureRoot()
    try {
      const notebooks: NotebookInfo[] = []
      for (const nb of await this.subdirs(this.root)) {
        const nbPath = this.notebookDir(nb)
        const sections: SectionInfo[] = []
        const colors = await this.readColors(nbPath)
        for (const sec of await this.subdirs(nbPath)) {
          const secPath = this.sectionDir(nb, sec)
          const files = await fs.readdir(secPath, { withFileTypes: true })
          const names = new Set(files.map((f) => f.name))
          const pages: PageInfo[] = files
            .filter((f) => f.isFile() && f.name.endsWith(PAGE_EXT) && !f.name.startsWith('.'))
            .map((f) => {
              const name = f.name.slice(0, -PAGE_EXT.length)
              return { name, path: path.join(secPath, f.name), hasCanvas: names.has(name + CANVAS_EXT) }
            })
          sections.push({ name: sec, path: secPath, pages: sortByOrder(pages, await this.readOrder(secPath)), ...(colors[sec] ? { color: colors[sec] } : {}) })
        }
        notebooks.push({ name: nb, path: nbPath, sections: sortByOrder(sections, await this.readOrder(nbPath)) })
      }
      return { root: this.root, notebooks: sortByOrder(notebooks, await this.readOrder(this.root)) }
    } catch (err) {
      wrapIo(err, 'Reading the justNotes folder')
    }
  }

  // ---------- notebooks ----------

  async createNotebook(rawName: string): Promise<NotebookInfo> {
    const name = validateName(rawName, 'notebook')
    await this.ensureRoot()
    await this.assertFree(this.root, name, (e) => `A notebook named "${e}"`)
    const dir = this.notebookDir(name)
    try {
      await fs.mkdir(dir)
    } catch (err) {
      wrapIo(err, `Creating notebook "${name}"`)
    }
    await this.addToOrder(this.root, name)
    return { name, path: dir, sections: [] }
  }

  async renameNotebook(oldName: string, rawNew: string): Promise<string> {
    const from = this.notebookDir(existingName(oldName, 'notebook'))
    const name = validateName(rawNew, 'notebook')
    await this.requireDir(from, `Notebook "${oldName}"`)
    if (name === oldName) return name
    await this.assertFree(this.root, name, (e) => `A notebook named "${e}"`, oldName)
    try {
      await fs.rename(from, this.notebookDir(name))
    } catch (err) {
      wrapIo(err, `Renaming notebook "${oldName}"`)
    }
    await this.renameInOrder(this.root, oldName, name)
    return name
  }

  /** Moves the notebook to the recycle bin; resolves to the bin entry's id. */
  async deleteNotebook(rawName: string, opts: DeleteOptions = {}): Promise<string> {
    const name = existingName(rawName, 'notebook')
    const dir = this.notebookDir(name)
    await this.requireDir(dir, `Notebook "${name}"`)
    if (!opts.force) {
      const contents = await this.countContents(dir, true)
      if (contents.sections + contents.pages + contents.otherFiles > 0) {
        throw new EngineFailure('NOT_EMPTY', `Notebook "${name}" is not empty.`, contents)
      }
    }
    const id = await this.toTrash({ kind: 'notebook', notebook: name }, [[dir, 'item']])
    await this.removeFromOrder(this.root, name)
    return id
  }

  // ---------- sections ----------

  async createSection(nbRaw: string, rawName: string): Promise<SectionInfo> {
    const nb = existingName(nbRaw, 'notebook')
    const name = validateName(rawName, 'section')
    const nbDir = this.notebookDir(nb)
    await this.requireDir(nbDir, `Notebook "${nb}"`)
    await this.assertFree(nbDir, name, (e) => `A section named "${e}" in "${nb}"`)
    const dir = this.sectionDir(nb, name)
    try {
      await fs.mkdir(dir)
    } catch (err) {
      wrapIo(err, `Creating section "${name}"`)
    }
    await this.addToOrder(nbDir, name)
    return { name, path: dir, pages: [] }
  }

  async renameSection(nbRaw: string, oldName: string, rawNew: string): Promise<string> {
    const nb = existingName(nbRaw, 'notebook')
    const from = this.sectionDir(nb, existingName(oldName, 'section'))
    const name = validateName(rawNew, 'section')
    await this.requireDir(from, `Section "${oldName}"`)
    if (name === oldName) return name
    await this.assertFree(this.notebookDir(nb), name, (e) => `A section named "${e}" in "${nb}"`, oldName)
    try {
      await fs.rename(from, this.sectionDir(nb, name))
    } catch (err) {
      wrapIo(err, `Renaming section "${oldName}"`)
    }
    await this.renameInOrder(this.notebookDir(nb), oldName, name)
    const colors = await this.readColors(this.notebookDir(nb))
    if (colors[oldName]) {
      colors[name] = colors[oldName]
      delete colors[oldName]
      await this.writeColors(this.notebookDir(nb), colors).catch(() => {})
    }
    return name
  }

  /** Moves the section to the recycle bin; resolves to the bin entry's id. */
  async deleteSection(nbRaw: string, rawName: string, opts: DeleteOptions = {}): Promise<string> {
    const nb = existingName(nbRaw, 'notebook')
    const name = existingName(rawName, 'section')
    const dir = this.sectionDir(nb, name)
    await this.requireDir(dir, `Section "${name}"`)
    if (!opts.force) {
      const contents = await this.countContents(dir, false)
      if (contents.pages + contents.otherFiles > 0) {
        throw new EngineFailure('NOT_EMPTY', `Section "${name}" is not empty.`, contents)
      }
    }
    const id = await this.toTrash({ kind: 'section', notebook: nb, section: name }, [[dir, 'item']])
    await this.removeFromOrder(this.notebookDir(nb), name)
    return id
  }

  // ---------- pages ----------

  async createPage(nbRaw: string, secRaw: string, rawName: string, content?: string): Promise<PageInfo> {
    if (content !== undefined && (typeof content !== 'string' || content.length > 2_000_000)) throw new EngineFailure('IO_ERROR', 'Invalid page content.')
    const nb = existingName(nbRaw, 'notebook')
    const sec = existingName(secRaw, 'section')
    const name = validateName(rawName, 'page')
    const secDir = this.sectionDir(nb, sec)
    await this.requireDir(secDir, `Section "${sec}"`)
    await this.assertFree(secDir, name + PAGE_EXT, (e) => `A page named "${e.slice(0, -PAGE_EXT.length)}" in "${sec}"`)
    const file = this.pageFile(nb, sec, name)
    try {
      // 'wx' fails instead of overwriting if the file appeared in the meantime.
      await fs.writeFile(file, content ?? `# ${name}\n\n`, { encoding: 'utf8', flag: 'wx' })
    } catch (err) {
      wrapIo(err, `Creating page "${name}"`)
    }
    await this.addToOrder(secDir, name)
    return { name, path: file, hasCanvas: false }
  }

  async renamePage(nbRaw: string, secRaw: string, oldRaw: string, rawNew: string): Promise<string> {
    const nb = existingName(nbRaw, 'notebook')
    const sec = existingName(secRaw, 'section')
    const oldName = existingName(oldRaw, 'page')
    const name = validateName(rawNew, 'page')
    const from = this.pageFile(nb, sec, oldName)
    if (!(await this.isFile(from))) throw new EngineFailure('NOT_FOUND', `Page "${oldName}" was not found on disk.`)
    if (name === oldName) return name
    const secDir = this.sectionDir(nb, sec)
    await this.assertFree(secDir, name + PAGE_EXT, (e) => `A page named "${e.slice(0, -PAGE_EXT.length)}" in "${sec}"`, oldName + PAGE_EXT)
    await this.assertFree(secDir, name + CANVAS_EXT, (e) => `A whiteboard file named "${e}"`, oldName + CANVAS_EXT)
    const to = this.pageFile(nb, sec, name)
    try {
      await fs.rename(from, to)
      const canvas = this.canvasFile(nb, sec, oldName)
      if (await this.isFile(canvas)) await fs.rename(canvas, this.canvasFile(nb, sec, name))
      // Keep the default "# Title" heading in sync with the file name.
      const text = await fs.readFile(to, 'utf8')
      const heading = `# ${oldName}\n`
      if (text.startsWith(heading)) await fs.writeFile(to, `# ${name}\n` + text.slice(heading.length), 'utf8')
      const hist = path.join(secDir, HISTORY_DIR, oldName)
      if (await this.isDir(hist)) await fs.rename(hist, path.join(secDir, HISTORY_DIR, name)).catch(() => {})
    } catch (err) {
      wrapIo(err, `Renaming page "${oldName}"`)
    }
    await this.renameInOrder(secDir, oldName, name)
    return name
  }

  /**
   * Moves a page (and its whiteboard) into another section, in this notebook or
   * another one. Images the page shows from its section's assets/ folder are
   * copied to the new section (the originals stay, other pages may use them)
   * and the links are updated. Resolves to the page's name.
   */
  async movePage(nbRaw: string, secRaw: string, pageRaw: string, toNbRaw: string, toSecRaw: string): Promise<string> {
    const nb = existingName(nbRaw, 'notebook')
    const sec = existingName(secRaw, 'section')
    const name = existingName(pageRaw, 'page')
    const toNb = existingName(toNbRaw, 'notebook')
    const toSec = existingName(toSecRaw, 'section')
    const from = this.pageFile(nb, sec, name)
    if (!(await this.isFile(from))) throw new EngineFailure('NOT_FOUND', `Page "${name}" was not found on disk.`)
    const fromDir = this.sectionDir(nb, sec)
    const toDir = this.sectionDir(toNb, toSec)
    if (fromDir === toDir) throw new EngineFailure('INVALID_NAME', `"${name}" is already in "${toSec}".`)
    await this.requireDir(toDir, `Section "${toSec}"`)
    await this.assertFree(toDir, name + PAGE_EXT, (e) => `A page named "${e.slice(0, -PAGE_EXT.length)}" in "${toSec}"`)
    await this.assertFree(toDir, name + CANVAS_EXT, (e) => `A whiteboard file named "${e}" in "${toSec}"`)

    const to = this.pageFile(toNb, toSec, name)
    const fromCanvas = this.canvasFile(nb, sec, name)
    try {
      const text = await this.carryAssets(await fs.readFile(from, 'utf8'), fromDir, toDir)
      await fs.writeFile(to, text, { encoding: 'utf8', flag: 'wx' })
      if (await this.isFile(fromCanvas)) {
        try {
          await fs.rename(fromCanvas, this.canvasFile(toNb, toSec, name))
        } catch (err) {
          await fs.rm(to, { force: true }) // undo, so the page isn't left in two places
          throw err
        }
      }
      await fs.rm(from)
      const hist = path.join(fromDir, HISTORY_DIR, name)
      if (await this.isDir(hist)) {
        await fs.mkdir(path.join(toDir, HISTORY_DIR), { recursive: true })
        await fs.rename(hist, path.join(toDir, HISTORY_DIR, name)).catch(() => {})
      }
    } catch (err) {
      wrapIo(err, `Moving page "${name}"`)
    }
    await this.removeFromOrder(fromDir, name)
    await this.addToOrder(toDir, name)
    return name
  }

  /** Copies images linked as ![..](assets/..) from one section to another; returns the updated Markdown. */
  private async carryAssets(markdown: string, fromDir: string, toDir: string): Promise<string> {
    const LINK = /(!\[[^\]]*\]\(<?)(\.\/)?(assets\/[^)\s>]+)/g
    const renamed = new Map<string, string>()
    for (const m of markdown.matchAll(LINK)) {
      const rel = m[3]
      if (renamed.has(rel)) continue
      let decoded = rel
      try {
        decoded = decodeURI(rel)
      } catch {
        /* use as written */
      }
      const src = path.join(fromDir, decoded)
      if (!src.startsWith(path.join(fromDir, ASSETS_DIR) + path.sep) || !(await this.isFile(src))) continue
      const data = await fs.readFile(src)
      const ext = path.extname(decoded)
      const base = path.basename(decoded, ext)
      const destDir = path.join(toDir, ASSETS_DIR)
      await fs.mkdir(destDir, { recursive: true })
      let finalName = ''
      for (let i = 0; i < 10000 && !finalName; i++) {
        const candidate = i === 0 ? `${base}${ext}` : `${base}-${i}${ext}`
        const dest = path.join(destDir, candidate)
        try {
          await fs.writeFile(dest, data, { flag: 'wx' })
          finalName = candidate
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
          // Same image already there (e.g. moved before): reuse it.
          if ((await fs.readFile(dest)).equals(data)) finalName = candidate
        }
      }
      if (!finalName) continue
      const newRel = `${ASSETS_DIR}/${finalName}`
      renamed.set(rel, rel.includes('%') ? encodeURI(newRel) : newRel)
    }
    return markdown.replace(LINK, (all, open: string, dot: string | undefined, rel: string) => (renamed.has(rel) ? `${open}${dot ?? ''}${renamed.get(rel)}` : all))
  }

  /** Moves the page (with whiteboard and history) to the recycle bin; resolves to the bin entry's id. */
  async deletePage(nbRaw: string, secRaw: string, rawName: string): Promise<string> {
    const nb = existingName(nbRaw, 'notebook')
    const sec = existingName(secRaw, 'section')
    const name = existingName(rawName, 'page')
    const file = this.pageFile(nb, sec, name)
    if (!(await this.isFile(file))) throw new EngineFailure('NOT_FOUND', `Page "${name}" was not found on disk.`)
    const secDir = this.sectionDir(nb, sec)
    const moves: [string, string][] = [[file, 'page.md']]
    if (await this.isFile(this.canvasFile(nb, sec, name))) moves.push([this.canvasFile(nb, sec, name), 'page.canvas.json'])
    if (await this.isDir(path.join(secDir, HISTORY_DIR, name))) moves.push([path.join(secDir, HISTORY_DIR, name), 'history'])
    const id = await this.toTrash({ kind: 'page', notebook: nb, section: sec, page: name }, moves)
    await this.removeFromOrder(secDir, name)
    return id
  }

  /**
   * Saves a page's Markdown. The page must already exist (so an edit can't
   * silently re-create a page that was deleted or renamed elsewhere).
   * Writes to a temp file first and renames it over the page, so a crash or
   * power cut mid-save can never leave a half-written note.
   */
  async writePage(nbRaw: string, secRaw: string, rawName: string, content: string): Promise<void> {
    if (typeof content !== 'string') throw new EngineFailure('IO_ERROR', 'Page content must be text.')
    const name = existingName(rawName, 'page')
    const file = this.pageFile(existingName(nbRaw, 'notebook'), existingName(secRaw, 'section'), name)
    if (!(await this.isFile(file))) {
      throw new EngineFailure('NOT_FOUND', `Page "${name}" no longer exists on disk, so your changes could not be saved.`)
    }
    await this.snapshot(file, false).catch(() => {}) // page history (at most every 10 minutes)
    const tmp = tempPathFor(file)
    try {
      await fs.writeFile(tmp, content, 'utf8')
      await fs.rename(tmp, file)
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {})
      wrapIo(err, `Saving page "${name}"`)
    }
  }

  /**
   * Stores an image in <Notebook>/<Section>/assets/ and returns the path to
   * use in Markdown, relative to the page (e.g. "assets/photo.png").
   * Never overwrites: picks "photo-1.png", "photo-2.png"... if needed.
   */
  async saveAsset(nbRaw: string, secRaw: string, fileName: string, data: Uint8Array): Promise<string> {
    const secDir = this.sectionDir(existingName(nbRaw, 'notebook'), existingName(secRaw, 'section'))
    await this.requireDir(secDir, `Section "${secRaw}"`)
    if (!(data instanceof Uint8Array)) throw new EngineFailure('IO_ERROR', 'Image data is missing.')
    if (data.byteLength > MAX_ASSET_BYTES) {
      throw new EngineFailure('IO_ERROR', `Images can be at most ${MAX_ASSET_BYTES / 1024 / 1024} MB.`)
    }
    const ext = path.extname(String(fileName)).toLowerCase()
    if (!IMAGE_EXTS.has(ext)) throw new EngineFailure('INVALID_NAME', `"${ext || fileName}" is not a supported image type.`)

    // Keep a readable, safe version of the original name.
    const base =
      path
        .basename(String(fileName), path.extname(String(fileName)))
        .replace(/[^\p{L}\p{N}._ -]+/gu, '-')
        .replace(/^[.\s-]+|[.\s-]+$/g, '')
        .slice(0, 80) || 'image'
    const dir = path.join(secDir, ASSETS_DIR)
    try {
      await fs.mkdir(dir, { recursive: true })
      for (let i = 0; i < 10000; i++) {
        const name = i === 0 ? `${base}${ext}` : `${base}-${i}${ext}`
        try {
          await fs.writeFile(path.join(dir, name), data, { flag: 'wx' })
          return `${ASSETS_DIR}/${name}`
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        }
      }
      throw new EngineFailure('IO_ERROR', 'Could not find a free file name for the image.')
    } catch (err) {
      wrapIo(err, 'Saving image')
    }
  }

  /**
   * Maps a path relative to the WikiBook root (as used by the wiki-file://
   * protocol) to an absolute image path, refusing anything outside the root
   * or anything that isn't an image.
   */
  resolveAsset(relPath: string): string {
    const abs = this.inside(...relPath.split('/').filter(Boolean))
    if (!IMAGE_EXTS.has(path.extname(abs).toLowerCase())) throw new EngineFailure('INVALID_NAME', 'Not an image.')
    return abs
  }

  /** The page's whiteboard (<Page>.canvas.json) as text, or null if it has none yet. */
  async readCanvas(nbRaw: string, secRaw: string, rawName: string): Promise<string | null> {
    const nb = existingName(nbRaw, 'notebook')
    const sec = existingName(secRaw, 'section')
    const name = existingName(rawName, 'page')
    try {
      return await fs.readFile(this.canvasFile(nb, sec, name), 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      wrapIo(err, `Reading the whiteboard of "${name}"`)
    }
  }

  /**
   * Saves the page's whiteboard next to it as <Page>.canvas.json (atomically).
   * The page itself must exist, so a whiteboard never ends up orphaned.
   */
  async writeCanvas(nbRaw: string, secRaw: string, rawName: string, content: string): Promise<void> {
    if (typeof content !== 'string') throw new EngineFailure('IO_ERROR', 'Whiteboard content must be text.')
    const nb = existingName(nbRaw, 'notebook')
    const sec = existingName(secRaw, 'section')
    const name = existingName(rawName, 'page')
    if (!(await this.isFile(this.pageFile(nb, sec, name)))) {
      throw new EngineFailure('NOT_FOUND', `Page "${name}" no longer exists on disk, so the whiteboard could not be saved.`)
    }
    const file = this.canvasFile(nb, sec, name)
    const tmp = tempPathFor(file)
    try {
      await fs.writeFile(tmp, content, 'utf8')
      await fs.rename(tmp, file)
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {})
      wrapIo(err, `Saving the whiteboard of "${name}"`)
    }
  }

  async readPage(nbRaw: string, secRaw: string, rawName: string): Promise<string> {
    const file = this.pageFile(existingName(nbRaw, 'notebook'), existingName(secRaw, 'section'), existingName(rawName, 'page'))
    try {
      return await fs.readFile(file, 'utf8')
    } catch (err) {
      wrapIo(err, `Reading page "${rawName}"`)
    }
  }

  /**
   * Absolute path of a notebook, section or page (page → its .md file),
   * checked to exist. Used for "Show in file manager".
   */
  async locate(ref: ItemRef): Promise<string> {
    const nb = existingName(ref.notebook, 'notebook')
    if (ref.section === undefined) {
      const p = this.notebookDir(nb)
      await this.requireDir(p, `Notebook "${nb}"`)
      return p
    }
    const sec = existingName(ref.section, 'section')
    if (ref.page === undefined) {
      const p = this.sectionDir(nb, sec)
      await this.requireDir(p, `Section "${sec}"`)
      return p
    }
    const p = this.pageFile(nb, sec, existingName(ref.page, 'page'))
    if (!(await this.isFile(p))) throw new EngineFailure('NOT_FOUND', `Page "${ref.page}" was not found on disk.`)
    return p
  }

  // ---------- custom order (drag & drop of section tabs and pages) ----------

  private async readOrder(dir: string): Promise<string[]> {
    try {
      const data = JSON.parse(await fs.readFile(path.join(dir, ORDER_FILE), 'utf8'))
      return Array.isArray(data) ? data.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }

  private async writeOrder(dir: string, names: string[]): Promise<void> {
    const file = path.join(dir, ORDER_FILE)
    const tmp = tempPathFor(file)
    await fs.writeFile(tmp, JSON.stringify([...new Set(names)], null, 1) + '\n', 'utf8')
    await fs.rename(tmp, file)
  }

  /** Only once an order was set by hand does a new item get a place at the end of it. */
  private async addToOrder(dir: string, name: string): Promise<void> {
    const order = await this.readOrder(dir)
    if (order.length && !order.includes(name)) await this.writeOrder(dir, [...order, name]).catch(() => {})
  }
  private async removeFromOrder(dir: string, name: string): Promise<void> {
    const order = await this.readOrder(dir)
    if (order.includes(name)) await this.writeOrder(dir, order.filter((n) => n !== name)).catch(() => {})
  }
  private async renameInOrder(dir: string, from: string, to: string): Promise<void> {
    const order = await this.readOrder(dir)
    if (order.includes(from)) await this.writeOrder(dir, order.map((n) => (n === from ? to : n))).catch(() => {})
  }

  /** Saves the order of the notebooks (File ▸ Open). */
  async setNotebookOrder(names: unknown): Promise<void> {
    if (!Array.isArray(names) || names.length > 10000 || !names.every((n) => typeof n === 'string')) throw new EngineFailure('INVALID_NAME', 'Invalid order.')
    await this.ensureRoot()
    try {
      await this.writeOrder(this.root, (names as string[]).map((n) => existingName(n, 'notebook')))
    } catch (err) {
      wrapIo(err, 'Saving the order')
    }
  }

  // ---------- section colors ----------

  private async readColors(nbDir: string): Promise<Record<string, string>> {
    try {
      const data = JSON.parse(await fs.readFile(path.join(nbDir, COLORS_FILE), 'utf8'))
      if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
      return Object.fromEntries(Object.entries(data).filter((e): e is [string, string] => typeof e[1] === 'string' && COLOR.test(e[1])))
    } catch {
      return {}
    }
  }

  private async writeColors(nbDir: string, colors: Record<string, string>): Promise<void> {
    const file = path.join(nbDir, COLORS_FILE)
    const tmp = tempPathFor(file)
    await fs.writeFile(tmp, JSON.stringify(colors, null, 1) + '\n', 'utf8')
    await fs.rename(tmp, file)
  }

  /** Sets (or with null, clears) a section's tab color. */
  async setSectionColor(nbRaw: string, secRaw: string, color: unknown): Promise<void> {
    const nb = existingName(nbRaw, 'notebook')
    const sec = existingName(secRaw, 'section')
    if (color !== null && (typeof color !== 'string' || !COLOR.test(color))) throw new EngineFailure('INVALID_NAME', 'Invalid color.')
    const nbDir = this.notebookDir(nb)
    await this.requireDir(this.sectionDir(nb, sec), `Section "${sec}"`)
    const colors = await this.readColors(nbDir)
    if (color === null) delete colors[sec]
    else colors[sec] = color.toLowerCase()
    try {
      await this.writeColors(nbDir, colors)
    } catch (err) {
      wrapIo(err, 'Saving the section color')
    }
  }

  /** Saves the order of a notebook's sections (section omitted) or a section's pages. */
  async setOrder(nbRaw: string, secRaw: string | null, names: unknown): Promise<void> {
    if (!Array.isArray(names) || names.length > 10000 || !names.every((n) => typeof n === 'string')) throw new EngineFailure('INVALID_NAME', 'Invalid order.')
    const nb = existingName(nbRaw, 'notebook')
    const dir = secRaw === null || secRaw === undefined ? this.notebookDir(nb) : this.sectionDir(nb, existingName(secRaw, 'section'))
    await this.requireDir(dir, 'That folder')
    try {
      await this.writeOrder(dir, (names as string[]).map((n) => existingName(n, 'page')))
    } catch (err) {
      wrapIo(err, 'Saving the order')
    }
  }

  // ---------- duplicate / append ----------

  /** Copies a page (and its whiteboard) as "<name> (copy)"; resolves to the new name. */
  async duplicatePage(nbRaw: string, secRaw: string, pageRaw: string): Promise<string> {
    const nb = existingName(nbRaw, 'notebook')
    const sec = existingName(secRaw, 'section')
    const name = existingName(pageRaw, 'page')
    const from = this.pageFile(nb, sec, name)
    if (!(await this.isFile(from))) throw new EngineFailure('NOT_FOUND', `Page "${name}" was not found on disk.`)
    const secDir = this.sectionDir(nb, sec)
    const existing = new Set((await this.entryNames(secDir)).map((e) => e.toLowerCase()))
    let copy = ''
    for (let i = 1; i < 1000 && !copy; i++) {
      const candidate = (i === 1 ? `${name} (copy)` : `${name} (copy ${i})`).slice(0, MAX_NAME_LENGTH)
      if (!existing.has((candidate + PAGE_EXT).toLowerCase()) && !existing.has((candidate + CANVAS_EXT).toLowerCase())) copy = candidate
    }
    if (!copy) throw new EngineFailure('DUPLICATE', 'Too many copies of this page.')
    try {
      let text = await fs.readFile(from, 'utf8')
      if (text.startsWith(`# ${name}\n`)) text = `# ${copy}\n` + text.slice(`# ${name}\n`.length)
      await fs.writeFile(this.pageFile(nb, sec, copy), text, { encoding: 'utf8', flag: 'wx' })
      if (await this.isFile(this.canvasFile(nb, sec, name))) await fs.copyFile(this.canvasFile(nb, sec, name), this.canvasFile(nb, sec, copy))
    } catch (err) {
      wrapIo(err, `Duplicating page "${name}"`)
    }
    const order = await this.readOrder(secDir)
    if (order.length) {
      const at = order.indexOf(name)
      order.splice(at < 0 ? order.length : at + 1, 0, copy)
      await this.writeOrder(secDir, order).catch(() => {})
    }
    return copy
  }

  /** Adds Markdown to the end of a page (used for "whiteboard snapshot into page"). */
  async appendToPage(nbRaw: string, secRaw: string, pageRaw: string, markdown: string): Promise<void> {
    if (typeof markdown !== 'string' || markdown.length > 1_000_000) throw new EngineFailure('IO_ERROR', 'Invalid content.')
    const text = await this.readPage(nbRaw, secRaw, pageRaw)
    await this.writePage(nbRaw, secRaw, pageRaw, text.replace(/\s*$/, '') + '\n\n' + markdown.trim() + '\n')
  }

  // ---------- recycle bin ----------

  private trashDir(): string {
    return path.join(this.root, TRASH_DIR)
  }

  /** Moves things into a new recycle-bin entry with a small description file. */
  private async toTrash(meta: Omit<TrashItem, 'id' | 'deletedAt' | 'pages'>, moves: [string, string][]): Promise<string> {
    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`
    const dir = path.join(this.trashDir(), id)
    const what = `Deleting ${meta.kind} "${meta.page ?? meta.section ?? meta.notebook}"`
    try {
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ ...meta, deletedAt: new Date().toISOString() }, null, 1), 'utf8')
      if (meta.kind === 'page') await fs.mkdir(path.join(dir, 'item'))
      for (const [from, to] of moves) await fs.rename(from, meta.kind === 'page' ? path.join(dir, 'item', to) : path.join(dir, to))
    } catch (err) {
      wrapIo(err, what)
    }
    return id
  }

  async listTrash(): Promise<TrashItem[]> {
    const out: TrashItem[] = []
    let ids: string[] = []
    try {
      ids = await fs.readdir(this.trashDir())
    } catch {
      return []
    }
    for (const id of ids.filter((i) => TRASH_ID.test(i))) {
      try {
        const meta = JSON.parse(await fs.readFile(path.join(this.trashDir(), id, 'meta.json'), 'utf8'))
        let pages = meta.kind === 'page' ? 1 : 0
        if (meta.kind !== 'page') {
          const c = await this.countContents(path.join(this.trashDir(), id, 'item'), meta.kind === 'notebook').catch(() => null)
          pages = c?.pages ?? 0
        }
        out.push({ id, kind: meta.kind, notebook: meta.notebook, section: meta.section, page: meta.page, deletedAt: meta.deletedAt, pages })
      } catch {
        /* not a valid entry */
      }
    }
    return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  }

  /** A free name in `dir` based on `name`: "name", then "name (restored)", "name (restored 2)", ... */
  private async freeName(dir: string, name: string, ext = ''): Promise<string> {
    const taken = new Set((await this.entryNames(dir).catch(() => [] as string[])).map((e) => e.toLowerCase()))
    for (let i = 0; i < 1000; i++) {
      const candidate = (i === 0 ? name : i === 1 ? `${name} (restored)` : `${name} (restored ${i})`).slice(0, MAX_NAME_LENGTH)
      if (!taken.has((candidate + ext).toLowerCase()) && (!ext || !taken.has((candidate + CANVAS_EXT).toLowerCase()))) return candidate
    }
    throw new EngineFailure('DUPLICATE', 'No free name to restore to.')
  }

  /** Puts a deleted item back where it was (re-creating its notebook/section if needed). */
  async restoreFromTrash(idRaw: unknown): Promise<ItemRef> {
    if (typeof idRaw !== 'string' || !TRASH_ID.test(idRaw)) throw new EngineFailure('NOT_FOUND', 'That item is not in the recycle bin.')
    const dir = path.join(this.trashDir(), idRaw)
    const item = (await this.listTrash()).find((t) => t.id === idRaw)
    if (!item) throw new EngineFailure('NOT_FOUND', 'That item is not in the recycle bin.')
    try {
      if (item.kind === 'notebook') {
        const name = await this.freeName(this.root, existingName(item.notebook, 'notebook'))
        await fs.rename(path.join(dir, 'item'), this.notebookDir(name))
        await fs.rm(dir, { recursive: true, force: true })
        await this.addToOrder(this.root, name)
        return { notebook: name }
      }
      const nb = existingName(item.notebook, 'notebook')
      await fs.mkdir(this.notebookDir(nb), { recursive: true })
      if (item.kind === 'section') {
        const name = await this.freeName(this.notebookDir(nb), existingName(item.section, 'section'))
        await fs.rename(path.join(dir, 'item'), this.sectionDir(nb, name))
        await fs.rm(dir, { recursive: true, force: true })
        await this.addToOrder(this.notebookDir(nb), name)
        return { notebook: nb, section: name }
      }
      const sec = existingName(item.section, 'section')
      const secDir = this.sectionDir(nb, sec)
      await fs.mkdir(secDir, { recursive: true })
      const name = await this.freeName(secDir, existingName(item.page, 'page'), PAGE_EXT)
      await fs.rename(path.join(dir, 'item', 'page.md'), this.pageFile(nb, sec, name))
      if (await this.isFile(path.join(dir, 'item', 'page.canvas.json'))) await fs.rename(path.join(dir, 'item', 'page.canvas.json'), this.canvasFile(nb, sec, name))
      if (await this.isDir(path.join(dir, 'item', 'history'))) {
        await fs.mkdir(path.join(secDir, HISTORY_DIR), { recursive: true })
        await fs.rename(path.join(dir, 'item', 'history'), path.join(secDir, HISTORY_DIR, name)).catch(() => {})
      }
      await fs.rm(dir, { recursive: true, force: true })
      await this.addToOrder(secDir, name)
      return { notebook: nb, section: sec, page: name }
    } catch (err) {
      wrapIo(err, 'Restoring from the recycle bin')
    }
  }

  /** Deletes one recycle-bin entry for good, or all of them (id omitted). */
  async emptyTrash(idRaw?: unknown): Promise<void> {
    if (idRaw !== undefined && idRaw !== null) {
      if (typeof idRaw !== 'string' || !TRASH_ID.test(idRaw)) throw new EngineFailure('NOT_FOUND', 'That item is not in the recycle bin.')
      await fs.rm(path.join(this.trashDir(), idRaw), { recursive: true, force: true })
      return
    }
    await fs.rm(this.trashDir(), { recursive: true, force: true })
  }

  /** Empties recycle-bin entries older than 30 days (run at start-up). */
  async purgeOldTrash(days = TRASH_KEEP_DAYS): Promise<number> {
    const cutoff = Date.now() - days * 24 * 3600 * 1000
    let n = 0
    for (const t of await this.listTrash()) {
      if (Date.parse(t.deletedAt) < cutoff) {
        await fs.rm(path.join(this.trashDir(), t.id), { recursive: true, force: true })
        n++
      }
    }
    return n
  }

  // ---------- page history ----------

  private historyDir(nb: string, sec: string, page: string): string {
    return path.join(this.sectionDir(nb, sec), HISTORY_DIR, page)
  }

  /** Copies the page's current text into its history (unless a recent copy exists, or `force`). */
  private async snapshot(file: string, force: boolean): Promise<void> {
    const page = path.basename(file, PAGE_EXT)
    const dir = path.join(path.dirname(file), HISTORY_DIR, page)
    const current = await fs.readFile(file, 'utf8')
    let versions: string[] = []
    try {
      versions = (await fs.readdir(dir)).filter((v) => VERSION_ID.test(v)).sort()
    } catch {
      /* none yet */
    }
    const latest = versions[versions.length - 1]
    if (!force && latest) {
      const st = await fs.stat(path.join(dir, latest))
      if (Date.now() - st.mtimeMs < HISTORY_EVERY_MS) return
      if ((await fs.readFile(path.join(dir, latest), 'utf8')) === current) return
    }
    if (!current.trim() || current === `# ${page}\n\n`) return // nothing worth keeping
    await fs.mkdir(dir, { recursive: true })
    const d = new Date()
    const p2 = (n: number) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
    let id = `${stamp}.md`
    for (let i = 2; versions.includes(id); i++) id = `${stamp}-${i}.md`
    await fs.writeFile(path.join(dir, id), current, 'utf8')
    versions.push(id)
    for (const old of versions.sort().slice(0, Math.max(0, versions.length - HISTORY_KEEP))) await fs.rm(path.join(dir, old), { force: true })
  }

  async listVersions(nbRaw: string, secRaw: string, pageRaw: string): Promise<PageVersion[]> {
    const dir = this.historyDir(existingName(nbRaw, 'notebook'), existingName(secRaw, 'section'), existingName(pageRaw, 'page'))
    let files: string[] = []
    try {
      files = (await fs.readdir(dir)).filter((v) => VERSION_ID.test(v))
    } catch {
      return []
    }
    const out: PageVersion[] = []
    for (const id of files) {
      const text = await fs.readFile(path.join(dir, id), 'utf8').catch(() => '')
      const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(id)!
      out.push({ id, savedAt: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toISOString(), size: text.length, preview: text.replace(/^#.*\n/, '').replace(/\s+/g, ' ').trim().slice(0, 140) })
    }
    return out.sort((a, b) => b.id.localeCompare(a.id))
  }

  async readVersion(nbRaw: string, secRaw: string, pageRaw: string, idRaw: unknown): Promise<string> {
    if (typeof idRaw !== 'string' || !VERSION_ID.test(idRaw)) throw new EngineFailure('NOT_FOUND', 'That version does not exist.')
    try {
      return await fs.readFile(path.join(this.historyDir(existingName(nbRaw, 'notebook'), existingName(secRaw, 'section'), existingName(pageRaw, 'page')), idRaw), 'utf8')
    } catch (err) {
      wrapIo(err, 'Reading that version')
    }
  }

  /** Keeps a copy of the page as it is now (History ▸ Save a version now). Resolves to false if it was empty. */
  async saveVersion(nbRaw: string, secRaw: string, pageRaw: string): Promise<boolean> {
    const file = this.pageFile(existingName(nbRaw, 'notebook'), existingName(secRaw, 'section'), existingName(pageRaw, 'page'))
    if (!(await this.isFile(file))) throw new EngineFailure('NOT_FOUND', 'That page no longer exists on disk.')
    const before = (await this.listVersions(nbRaw, secRaw, pageRaw)).length
    try {
      await this.snapshot(file, true)
    } catch (err) {
      wrapIo(err, 'Saving a version')
    }
    return (await this.listVersions(nbRaw, secRaw, pageRaw)).length !== before || before >= HISTORY_KEEP
  }

  /** Makes an earlier version the current page (the current text is kept in the history first). */
  async restoreVersion(nbRaw: string, secRaw: string, pageRaw: string, idRaw: unknown): Promise<string> {
    const text = await this.readVersion(nbRaw, secRaw, pageRaw, idRaw)
    const file = this.pageFile(existingName(nbRaw, 'notebook'), existingName(secRaw, 'section'), existingName(pageRaw, 'page'))
    await this.snapshot(file, true).catch(() => {})
    const tmp = tempPathFor(file)
    try {
      await fs.writeFile(tmp, text, 'utf8')
      await fs.rename(tmp, file)
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {})
      wrapIo(err, 'Restoring that version')
    }
    return text
  }

  // ---------- notebook backup (.zip) ----------

  /** The notebook as a .zip (pages, whiteboards, pictures, order; not history). */
  async exportNotebook(nbRaw: string): Promise<Uint8Array> {
    const nb = existingName(nbRaw, 'notebook')
    const base = this.notebookDir(nb)
    await this.requireDir(base, `Notebook "${nb}"`)
    const files: Zippable = {}
    const walk = async (dir: string, rel: string): Promise<void> => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (e.name === HISTORY_DIR || e.name === TRASH_DIR || TEMP_FILE.test(e.name)) continue
        const full = path.join(dir, e.name)
        const r = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) await walk(full, r)
        else if (e.isFile()) files[`${nb}/${r}`] = [await fs.readFile(full), { level: 6 }]
      }
    }
    try {
      await walk(base, '')
      if (!Object.keys(files).length) files[`${nb}/`] = strToU8('')
      return zipSync(files)
    } catch (err) {
      wrapIo(err, `Exporting notebook "${nb}"`)
    }
  }

  /**
   * Adds a notebook from a .zip made by Export (or any zip of Section/Page.md folders).
   * Only notes, whiteboards, pictures and order files are taken; nothing can be
   * written outside the new notebook. Resolves to the new notebook's name.
   */
  async importNotebook(data: unknown, suggestedName: unknown): Promise<string> {
    if (!(data instanceof Uint8Array)) throw new EngineFailure('IO_ERROR', 'That file could not be read.')
    if (data.byteLength > 500 * 1024 * 1024) throw new EngineFailure('IO_ERROR', 'That backup is too large (over 500 MB).')
    let entries: Record<string, Uint8Array>
    try {
      let total = 0
      entries = unzipSync(data, {
        filter: (f) => {
          total += f.originalSize
          if (total > 2 * 1024 * 1024 * 1024) throw new Error('too big')
          return !f.name.endsWith('/')
        }
      })
    } catch {
      throw new EngineFailure('IO_ERROR', 'That file is not a notebook backup (.zip).')
    }
    const names = Object.keys(entries).map((n) => n.replace(/\\/g, '/'))
    if (names.length > 50000) throw new EngineFailure('IO_ERROR', 'That backup has too many files.')
    // A single top-level folder is the notebook itself.
    const tops = new Set(names.map((n) => n.split('/')[0]))
    const strip = tops.size === 1 && names.every((n) => n.includes('/'))
    const top = strip ? [...tops][0] : ''
    const wanted = typeof suggestedName === 'string' && suggestedName.trim() ? suggestedName : top || 'Imported notebook'
    let nbName: string
    try {
      nbName = validateName(wanted, 'notebook')
    } catch {
      nbName = 'Imported notebook'
    }
    await this.ensureRoot()
    nbName = await this.freeName(this.root, nbName)
    const target = this.notebookDir(nbName)
    const allowed = (p: string) => p.endsWith(PAGE_EXT) || p.endsWith(CANVAS_EXT) || p.endsWith('/' + ORDER_FILE) || p === ORDER_FILE || p === COLORS_FILE || IMAGE_EXTS.has(path.extname(p).toLowerCase())
    let written = 0
    try {
      await fs.mkdir(target)
      for (const [rawName, bytes] of Object.entries(entries)) {
        const rel = (strip ? rawName.replace(/\\/g, '/').slice(top.length + 1) : rawName.replace(/\\/g, '/')).replace(/^\/+/, '')
        const parts = rel.split('/')
        if (!rel || parts.length > 3 || parts.some((p) => !p || p === '.' || p === '..' || /[\0]/.test(p)) || !allowed(rel)) continue
        if (parts.some((p, i) => i < parts.length - 1 && p.startsWith('.'))) continue
        const dest = path.resolve(target, ...parts)
        if (!dest.startsWith(target + path.sep)) continue
        await fs.mkdir(path.dirname(dest), { recursive: true })
        await fs.writeFile(dest, bytes, { flag: 'wx' }).catch(() => {})
        written++
      }
    } catch (err) {
      await fs.rm(target, { recursive: true, force: true }).catch(() => {})
      wrapIo(err, 'Importing the notebook')
    }
    if (!written) {
      await fs.rm(target, { recursive: true, force: true }).catch(() => {})
      throw new EngineFailure('IO_ERROR', 'No pages were found in that file.')
    }
    return nbName
  }

  // ---------- helpers ----------

  private async countContents(dir: string, isNotebook: boolean): Promise<NonNullable<EngineError['contents']>> {
    const counts = { sections: 0, pages: 0, otherFiles: 0 }
    const walk = async (d: string, depth: number): Promise<void> => {
      for (const e of await fs.readdir(d, { withFileTypes: true })) {
        if (e.name === HISTORY_DIR || e.name === ORDER_FILE || e.name === COLORS_FILE || TEMP_FILE.test(e.name)) continue
        const full = path.join(d, e.name)
        // In a notebook, depth-0 folders are sections; anything else is "other".
        if (e.isDirectory()) {
          if (isNotebook && depth === 0) counts.sections++
          else counts.otherFiles++
          await walk(full, depth + 1)
        } else if (e.name.endsWith(PAGE_EXT) && depth === (isNotebook ? 1 : 0)) {
          counts.pages++
        } else {
          counts.otherFiles++
        }
      }
    }
    try {
      await walk(dir, 0)
    } catch (err) {
      wrapIo(err, 'Reading folder contents')
    }
    return counts
  }
}
