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

/** Points at a notebook (section/page omitted), a section (page omitted) or a page. */
export interface ItemRef {
  notebook: string
  section?: string
  page?: string
}

// Rename functions resolve to the final name (trimmed, ".md" removed).

export interface DeleteOptions {
  /** Must be true to delete a folder that still has things in it. */
  force?: boolean
}

/** The API the preload script exposes to the renderer as `window.wiki`. */
export interface WikiApi {
  getRoot(): Promise<Result<string>>
  listTree(): Promise<Result<Tree>>

  createNotebook(name: string): Promise<Result<NotebookInfo>>
  renameNotebook(oldName: string, newName: string): Promise<Result<string>>
  deleteNotebook(name: string, opts?: DeleteOptions): Promise<Result<void>>

  createSection(notebook: string, name: string): Promise<Result<SectionInfo>>
  renameSection(notebook: string, oldName: string, newName: string): Promise<Result<string>>
  deleteSection(notebook: string, name: string, opts?: DeleteOptions): Promise<Result<void>>

  createPage(notebook: string, section: string, name: string): Promise<Result<PageInfo>>
  renamePage(notebook: string, section: string, oldName: string, newName: string): Promise<Result<string>>
  deletePage(notebook: string, section: string, name: string): Promise<Result<void>>

  /** Raw Markdown of a page. */
  readPage(notebook: string, section: string, name: string): Promise<Result<string>>
  /** Saves a page's Markdown (atomically). Fails with NOT_FOUND if the page is gone. */
  writePage(notebook: string, section: string, name: string, content: string): Promise<Result<void>>

  /** The page's whiteboard file (<Page>.canvas.json) as text, or null if there is none yet. */
  readCanvas(notebook: string, section: string, name: string): Promise<Result<string | null>>
  /** Saves the page's whiteboard next to the page (atomically). */
  writeCanvas(notebook: string, section: string, name: string, content: string): Promise<Result<void>>

  /** Stores image bytes in the section's assets/ folder; resolves to the relative path for Markdown. */
  saveAsset(notebook: string, section: string, fileName: string, data: Uint8Array): Promise<Result<string>>
  /** Shows a file picker and copies the chosen image into assets/. Resolves to null if cancelled. */
  pickImage(notebook: string, section: string): Promise<Result<string | null>>

  /** Window zoom: step in/out, or reset to 100%. Resolves to the new zoom factor. */
  zoom(direction: 'in' | 'out' | 'reset'): number
  /** Makes native parts of the window (menus, dialogs, scrollbars) follow the app theme. */
  setTheme(theme: 'dark' | 'light'): Promise<Result<void>>

  /** Opens the WikiBook folder in the system file manager. */
  openRootFolder(): Promise<Result<void>>
  /** Opens the file manager with this notebook/section/page selected. */
  showInFolder(ref: ItemRef): Promise<Result<void>>

  /**
   * Called (debounced) whenever something changes inside the WikiBook folder,
   * whether by this app or by another program. Returns an unsubscribe function.
   */
  onChanged(callback: () => void): () => void
  /** `flush` runs (and is awaited) before the window closes. Returns an unsubscribe function. */
  onBeforeClose(flush: () => Promise<void>): () => void
}
