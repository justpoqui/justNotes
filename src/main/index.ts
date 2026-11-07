import { initUpdater } from './updater'
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, session, shell } from 'electron'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { FileEngine } from './fileEngine'
import { registerIpc } from './ipc'
import { watchFolder } from './watcher'
import { resolveNotesRoot } from './notesLocation'
import { handleAppAssetProtocol, handleAssetProtocol, registerAssetScheme } from './assetProtocol'


registerAssetScheme()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    title: 'justNotes',
    // Window / taskbar icon (installed copies also get it from their menu entry).
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '../../build/icon.png'),
    show: false,
    backgroundColor: '#1e1f22', // dark from the first frame, no white flash
    // No system title bar: the app draws its own (justNotes name, tabs and
    // minimize / maximize / close buttons in the ribbon's top row).
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Chromium's spellchecker downloads its dictionaries from Google on Linux;
      // keep the app fully offline.
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Keep the maximize/restore button in sync with the window.
  const sendMaximized = () => win.webContents.send('win:maximized', win.isMaximized())
  win.on('maximize', sendMaximized)
  win.on('unmaximize', sendMaximized)

  // Before the window closes, let the page editor save any pending edits.
  // Gives up waiting after a few seconds so the window can never get stuck open.
  let canClose = false
  win.on('close', (e) => {
    if (canClose || win.webContents.isCrashed()) return
    e.preventDefault()
    const close = () => {
      if (canClose) return
      canClose = true
      clearTimeout(fallback)
      ipcMain.removeListener('app:ready-to-close', onReady)
      if (!win.isDestroyed()) win.close()
    }
    const onReady = (event: Electron.IpcMainEvent) => {
      if (event.sender === win.webContents) close()
    }
    const fallback = setTimeout(close, 4000)
    ipcMain.on('app:ready-to-close', onReady)
    win.webContents.send('app:flush-before-close')
  })

  // The renderer is never allowed to navigate away or open new windows;
  // external links go to the system browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

// Window buttons for the custom title bar.
ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
ipcMain.on('win:toggle-maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  if (w) w.isMaximized() ? w.unmaximize() : w.maximize()
})
ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
ipcMain.handle('win:is-maximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false)

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark'
  const engine = new FileEngine(await resolveNotesRoot())
  await engine.ensureRoot().catch((err) => console.error(err))
  void engine.cleanupTempFiles().catch(() => {})
  void engine.purgeOldTrash().catch(() => {}) // recycle bin keeps things for 30 days
  // No hidden menu: its shortcuts (Ctrl+R reload, Ctrl+Shift+I developer tools, Ctrl+± app zoom)
  // clashed with the app's own. Copy/paste/undo work without it.
  Menu.setApplicationMenu(null)
  registerIpc(engine)
  void initUpdater()

  // Network rules for everything the app loads (main window, whiteboard, print/PDF page):
  //  - no internet at all: every http(s)/websocket request is cancelled (except the local
  //    dev server when running `npm run dev`), so a web picture in a note is never fetched;
  //  - local files only from the app itself, the notes folder and the temporary print page.
  // Links you Ctrl+click still open in your normal browser (that doesn't go through here).
  const devServer = process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).host : null
  const allowedDirs = [path.join(__dirname, '..'), engine.root].map((d) => path.resolve(d) + path.sep)
  const printPrefix = path.join(os.tmpdir(), 'justnotes-print-')
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['file://*/*', 'http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
    const url = new URL(details.url)
    if (url.protocol !== 'file:') {
      const ok = devServer !== null && url.host === devServer
      if (!ok) console.warn('Blocked network request:', details.url)
      return callback({ cancel: !ok })
    }
    let file = ''
    try {
      file = path.resolve(fileURLToPath(details.url))
    } catch {
      return callback({ cancel: true })
    }
    const ok = allowedDirs.some((d) => file.startsWith(d)) || file.startsWith(printPrefix)
    if (!ok) console.warn('Blocked file access:', file)
    callback({ cancel: !ok })
  })
  // Chromium's own spellchecker downloads dictionaries from Google (even when switched off,
  // and outside the rules above); justNotes has its own offline one. Point that download at
  // a closed port on this computer so nothing ever leaves the machine.
  session.defaultSession.setSpellCheckerEnabled(false)
  session.defaultSession.setSpellCheckerDictionaryDownloadURL('http://127.0.0.1:9/')
  handleAssetProtocol(engine)
  handleAppAssetProtocol(path.join(__dirname, '../renderer'))
  // Tell every window when something in the notes folder changes.
  const stopWatching = watchFolder(engine.root, () => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('wiki:changed')
  })
  app.on('will-quit', stopWatching)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
