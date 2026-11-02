import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
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
    show: false,
    backgroundColor: '#1e1f22', // dark from the first frame, no white flash
    // No system title bar: the app draws its own (justNotes name, tabs and
    // minimise / maximise / close buttons in the ribbon's top row).
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

  // Keep the maximise/restore button in sync with the window.
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
  registerIpc(engine)
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
