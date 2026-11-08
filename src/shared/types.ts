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
  /** 0 = a normal page, 1 = a subpage of the page above, 2 = a subpage of that subpage. */
  level?: number
}

export interface SectionInfo {
  name: string
  path: string
  pages: PageInfo[]
  /** Tab color ("#rrggbb"), once one has been given. */
  color?: string
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

/** Something in the recycle bin. */
export interface TrashItem {
  id: string
  kind: 'notebook' | 'section' | 'page'
  notebook: string
  section?: string
  page?: string
  /** ISO date. */
  deletedAt: string
  /** Pages inside (1 for a page). */
  pages: number
}

/** An earlier saved version of a page (page history). */
export interface PageVersion {
  id: string
  savedAt: string
  size: number
  preview: string
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
  renameNotebook(oldName: string, newName: string): Promise<Result<string>>
  deleteNotebook(name: string, opts?: DeleteOptions): Promise<Result<string>>  // → recycle-bin id

  createSection(notebook: string, name: string): Promise<Result<SectionInfo>>
  renameSection(notebook: string, oldName: string, newName: string): Promise<Result<string>>
  deleteSection(notebook: string, name: string, opts?: DeleteOptions): Promise<Result<string>>  // → recycle-bin id

  /** `content` (optional) is the new page's Markdown, e.g. from a template. */
  createPage(notebook: string, section: string, name: string, content?: string): Promise<Result<PageInfo>>
  renamePage(notebook: string, section: string, oldName: string, newName: string): Promise<Result<string>>
  deletePage(notebook: string, section: string, name: string): Promise<Result<string>>  // → recycle-bin id
  /** Copies a page as "<name> (copy)"; resolves to the new name. */
  duplicatePage(notebook: string, section: string, name: string): Promise<Result<string>>
  /** Saves the order of a notebook's sections (section = null) or of a section's pages. */
  setOrder(notebook: string, section: string | null, names: string[]): Promise<Result<void>>
  setNotebookOrder(names: string[]): Promise<Result<void>>
  /** Which pages of a section are subpages: { page: level } (others are top-level). */
  setPageLevels(notebook: string, section: string, levels: Record<string, number>): Promise<Result<void>>
  setSectionColor(notebook: string, section: string, color: string | null): Promise<Result<void>>
  /** Adds Markdown at the end of a page. */
  appendToPage(notebook: string, section: string, name: string, markdown: string): Promise<Result<void>>

  /** Recycle bin (deleted notebooks, sections and pages; emptied after 30 days). */
  listTrash(): Promise<Result<TrashItem[]>>
  restoreFromTrash(id: string): Promise<Result<ItemRef>>
  /** Deletes one item for good, or everything when `id` is omitted. */
  emptyTrash(id?: string): Promise<Result<void>>

  /** Page history (earlier versions, kept while editing). */
  listVersions(notebook: string, section: string, name: string): Promise<Result<PageVersion[]>>
  readVersion(notebook: string, section: string, name: string, id: string): Promise<Result<string>>
  /** Makes a version the current page; resolves to its text. */
  restoreVersion(notebook: string, section: string, name: string, id: string): Promise<Result<string>>
  saveVersion(notebook: string, section: string, name: string): Promise<Result<boolean>>

  /** Saves the notebook as a .zip (save dialog). Resolves to the path, or null if cancelled. */
  exportNotebook(notebook: string): Promise<Result<string | null>>
  /** Adds a notebook from a .zip backup (open dialog). Resolves to its name, or null if cancelled. */
  /** `fromFolder`: where the file picker starts (e.g. the automatic backups folder). */
  importNotebook(fromFolder?: string): Promise<Result<string | null>>
  /** Backs up every notebook into a dated folder inside `folder` ('' = the default), keeping the newest `keep`. */
  runAutoBackup(folder: string, keep: number): Promise<Result<{ folder: string; notebooks: number }>>
  /** Lets the user pick a folder for automatic backups (null if cancelled). */
  chooseBackupFolder(current: string): Promise<Result<string | null>>
  /** The folder used when none was chosen. */
  defaultBackupFolder(): Promise<Result<string>>
  openBackupFolder(folder: string): Promise<Result<void>>

  /** Moves a page (with its whiteboard and images) to another section. Resolves to its name. */
  movePage(notebook: string, section: string, name: string, toNotebook: string, toSection: string): Promise<Result<string>>

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

  /** Size of the whole app (1 = 100%, 0.5–2). */
  setAppZoom(factor: number): void
  /** Makes native parts of the window (menus, dialogs, scrollbars) follow the app theme. */
  setTheme(theme: 'dark' | 'light'): Promise<Result<void>>

  /** Opens the justNotes folder in the system file manager. */
  openRootFolder(): Promise<Result<void>>
  /** justNotes' own license, and the notices for the third-party software it includes. */
  getLegal(): Promise<Result<{ license: string; notices: string; version: string }>>
  getUpdateState(): Promise<Result<UpdateState>>
  checkForUpdates(): Promise<Result<UpdateState>>
  /** Installs the downloaded update and restarts the app. */
  installUpdate(): Promise<Result<void>>
  onUpdateState(cb: (state: UpdateState) => void): () => void
  /** Opens the file manager with this notebook/section/page selected. */
  showInFolder(ref: ItemRef): Promise<Result<void>>

  /**
   * Called (debounced) whenever something changes inside the justNotes folder,
   * whether by this app or by another program. Returns an unsubscribe function.
   */
  onChanged(callback: () => void): () => void
  /** Saves the page (as HTML) to a PDF chosen in a save dialog. Resolves to the path, or null if cancelled. */
  exportPdf(html: string, title: string): Promise<Result<string | null>>
  /** Font families installed on this computer. */
  listFonts(): Promise<Result<string[]>>
  /** Cut / copy / paste / select all in the focused text. */
  editCommand(cmd: 'cut' | 'copy' | 'paste' | 'selectAll'): void

  /** The buttons of the app's own title bar. */
  windowControls: {
    minimize(): void
    toggleMaximize(): void
    /** Closes the window (pending edits are saved first). */
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizedChange(callback: (maximized: boolean) => void): () => void
  }

  /** `flush` runs (and is awaited) before the window closes. Returns an unsubscribe function. */
  onBeforeClose(flush: () => Promise<void>): () => void
}

/** Where the app is with updates (shown as "Update pending" when one is ready to install). */
export interface UpdateState {
  status: 'unsupported' | 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'installing' | 'error'
  /** This copy's version. */
  current: string
  /** The new version, once one is found. */
  version?: string
  /** What's new in it (the release notes). */
  notes?: string
  /** Download progress, 0–100. */
  percent?: number
  /** Explanation for 'unsupported' and 'error'. */
  message?: string
  /** When GitHub was last asked (ISO time). */
  checkedAt?: string
  kind?: 'nsis' | 'appimage' | 'deb'
}

