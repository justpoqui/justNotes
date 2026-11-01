import { app, BrowserWindow, shell } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { FileEngine } from './fileEngine'
import { registerIpc } from './ipc'

// Notes live in ~/WikiBook/Notebooks. WIKIBOOK_ROOT overrides it (handy for testing).
const root = process.env.WIKIBOOK_ROOT || path.join(os.homedir(), 'WikiBook', 'Notebooks')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    title: 'justNotes',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

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

app.whenReady().then(() => {
  registerIpc(new FileEngine(root))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
