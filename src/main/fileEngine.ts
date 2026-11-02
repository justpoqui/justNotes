// The file engine: the only code that touches the WikiBook folder on disk.
//
// Layout:  <root>/<Notebook>/<Section>/<Page>.md
//          <root>/<Notebook>/<Section>/<Page>.canvas.json   (whiteboard, Phase 5)
//
// Every page is a plain Markdown file and folders are the hierarchy, so the
// notes stay readable without the app.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  DeleteOptions,
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
  }

  // ---------- paths ----------

  /** Joins path parts under the root and refuses anything that escapes it. */
  private inside(...parts: string[]): string {
    const p = path.resolve(this.root, ...parts)
    if (p !== this.root && !p.startsWith(this.root + path.sep)) {
      throw new EngineFailure('INVALID_NAME', 'That path points outside the WikiBook folder.')
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
            .sort(byName)
          sections.push({ name: sec, path: secPath, pages })
        }
        notebooks.push({ name: nb, path: nbPath, sections: sections.sort(byName) })
      }
      return { root: this.root, notebooks: notebooks.sort(byName) }
    } catch (err) {
      wrapIo(err, 'Reading the WikiBook folder')
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
    return name
  }

  async deleteNotebook(rawName: string, opts: DeleteOptions = {}): Promise<void> {
    const name = existingName(rawName, 'notebook')
    const dir = this.notebookDir(name)
    await this.requireDir(dir, `Notebook "${name}"`)
    if (!opts.force) {
      const contents = await this.countContents(dir, true)
      if (contents.sections + contents.pages + contents.otherFiles > 0) {
        throw new EngineFailure('NOT_EMPTY', `Notebook "${name}" is not empty.`, contents)
      }
    }
    await this.removeDir(dir, `Deleting notebook "${name}"`)
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
    return name
  }

  async deleteSection(nbRaw: string, rawName: string, opts: DeleteOptions = {}): Promise<void> {
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
    await this.removeDir(dir, `Deleting section "${name}"`)
  }

  // ---------- pages ----------

  async createPage(nbRaw: string, secRaw: string, rawName: string): Promise<PageInfo> {
    const nb = existingName(nbRaw, 'notebook')
    const sec = existingName(secRaw, 'section')
    const name = validateName(rawName, 'page')
    const secDir = this.sectionDir(nb, sec)
    await this.requireDir(secDir, `Section "${sec}"`)
    await this.assertFree(secDir, name + PAGE_EXT, (e) => `A page named "${e.slice(0, -PAGE_EXT.length)}" in "${sec}"`)
    const file = this.pageFile(nb, sec, name)
    try {
      // 'wx' fails instead of overwriting if the file appeared in the meantime.
      await fs.writeFile(file, `# ${name}\n\n`, { encoding: 'utf8', flag: 'wx' })
    } catch (err) {
      wrapIo(err, `Creating page "${name}"`)
    }
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
    } catch (err) {
      wrapIo(err, `Renaming page "${oldName}"`)
    }
    return name
  }

  async deletePage(nbRaw: string, secRaw: string, rawName: string): Promise<void> {
    const nb = existingName(nbRaw, 'notebook')
    const sec = existingName(secRaw, 'section')
    const name = existingName(rawName, 'page')
    const file = this.pageFile(nb, sec, name)
    if (!(await this.isFile(file))) throw new EngineFailure('NOT_FOUND', `Page "${name}" was not found on disk.`)
    try {
      await fs.rm(file)
      await fs.rm(this.canvasFile(nb, sec, name), { force: true })
    } catch (err) {
      wrapIo(err, `Deleting page "${name}"`)
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

  // ---------- helpers ----------

  private async countContents(dir: string, isNotebook: boolean): Promise<NonNullable<EngineError['contents']>> {
    const counts = { sections: 0, pages: 0, otherFiles: 0 }
    const walk = async (d: string, depth: number): Promise<void> => {
      for (const e of await fs.readdir(d, { withFileTypes: true })) {
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

  private async removeDir(dir: string, what: string): Promise<void> {
    if (dir === this.root) throw new EngineFailure('INVALID_NAME', 'Refusing to delete the WikiBook root folder.')
    try {
      await fs.rm(dir, { recursive: true })
    } catch (err) {
      wrapIo(err, what)
    }
  }
}
