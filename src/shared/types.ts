// Types shared by the main process, the preload script and the renderer.

export type ErrorCode =
  | 'INVALID_NAME' // empty, reserved, or contains characters not allowed in file names
  | 'DUPLICATE' // something with that name already exists at that level
  | 'NOT_FOUND' // the notebook/section/page does not exist on disk
  | 'NOT_EMPTY' // tried to delete a non-empty folder without confirming
  | 'IO_ERROR' // anything else the file system threw

export interface EngineError {
  code: ErrorCode
  message: string
  /** For NOT_EMPTY: what is inside, so the UI can show it in the confirmation. */
  contents?: { sections: number; pages: number; otherFiles: number }
}

/** Every IPC call resolves to one of these, so error codes survive the IPC boundary. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: EngineError }

export interface PageInfo {
  name: string
  /** Absolute path of the .md file. */
  path: string
  /** True when a <Page>.canvas.json whiteboard file exists next to the page (Phase 5). */
  hasCanvas: boolean
}

export interface SectionInfo {
  name: string
  path: string
  pages: PageInfo[]
}

export interface NotebookInfo {
  name: string
  path: string
  sections: SectionInfo[]
}

export interface Tree {
  root: string
  notebooks: NotebookInfo[]
}

export interface DeleteOptions {
  /** Must be true to delete a folder that still has things in it. */
  force?: boolean
}

/** The API the preload script exposes to the renderer as `window.wiki`. */
export interface WikiApi {
  getRoot(): Promise<Result<string>>
  listTree(): Promise<Result<Tree>>

  createNotebook(name: string): Promise<Result<NotebookInfo>>
  renameNotebook(oldName: string, newName: string): Promise<Result<void>>
  deleteNotebook(name: string, opts?: DeleteOptions): Promise<Result<void>>

  createSection(notebook: string, name: string): Promise<Result<SectionInfo>>
  renameSection(notebook: string, oldName: string, newName: string): Promise<Result<void>>
  deleteSection(notebook: string, name: string, opts?: DeleteOptions): Promise<Result<void>>

  createPage(notebook: string, section: string, name: string): Promise<Result<PageInfo>>
  renamePage(notebook: string, section: string, oldName: string, newName: string): Promise<Result<void>>
  deletePage(notebook: string, section: string, name: string): Promise<Result<void>>

  /** Opens the WikiBook folder in the system file manager. */
  openRootFolder(): Promise<Result<void>>
}
