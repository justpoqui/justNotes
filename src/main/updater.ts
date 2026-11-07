// Updates: new versions are published as GitHub releases of justpoqui/justNotes (built by
// .github/workflows/release.yml whenever changes are pushed). The app looks for one when
// asked (at start-up and every few hours unless turned off in Settings), downloads it in the
// background and then shows "Update pending"; it's installed only when you click Install.
//
// This is the one thing in justNotes that goes online, and only to GitHub: every other host
// is blocked for the updater's network session (see allowUpdaterHosts).

import { app, BrowserWindow, session } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { UpdateState } from '../shared/types'
import { notesText } from './releaseNotes'

const GITHUB_HOSTS = new Set(['github.com', 'api.github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'github-releases.githubusercontent.com'])

let state: UpdateState = { status: 'idle', current: app.getVersion() }
let updater: import('electron-updater').AppUpdater | null = null

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:state', state)
}

/** How this copy was installed: the Windows installer, an AppImage or the .deb can update themselves. */
function installKind(): 'nsis' | 'appimage' | 'deb' | null {
  if (process.platform === 'win32') return app.isPackaged ? 'nsis' : null
  if (process.env.APPIMAGE) return 'appimage'
  try {
    const file = path.join(process.resourcesPath, 'package-type')
    if (existsSync(file) && readFileSync(file, 'utf8').trim() === 'deb') return 'deb'
  } catch {
    /* not packaged */
  }
  return null
}

/** The updater's own network session may reach GitHub (and a test server, if one is set) only. */
function allowUpdaterHosts(testHost: string | null): void {
  session.fromPartition('electron-updater').webRequest.onBeforeRequest((details, callback) => {
    let ok = false
    try {
      const url = new URL(details.url)
      ok = (url.protocol === 'https:' && GITHUB_HOSTS.has(url.hostname)) || (testHost !== null && url.host === testHost)
    } catch {
      ok = false
    }
    if (!ok) console.warn('Updater: blocked', details.url)
    callback({ cancel: !ok })
  })
}

const friendly = (err: unknown): string => {
  const msg = err instanceof Error ? err.message : String(err)
  if (/ERR_INTERNET_DISCONNECTED|ENOTFOUND|ERR_NAME_NOT_RESOLVED|ETIMEDOUT|ECONNREFUSED|ERR_CONNECTION|net::/i.test(msg)) return 'Couldn’t reach GitHub. Check your internet connection and try again.'
  if (/404|Unable to find latest version|No published versions/i.test(msg)) return 'No released version was found on GitHub yet.'
  if (/sha512 checksum mismatch/i.test(msg)) return 'The downloaded update was damaged, so it wasn’t used. It will be downloaded again.'
  return `The update didn’t work: ${msg.split('\n')[0].slice(0, 200)}`
}

export async function initUpdater(): Promise<void> {
  // For testing only: JUSTNOTES_UPDATE_URL points at a folder with latest-linux.yml and the files.
  const testUrl = process.env.JUSTNOTES_UPDATE_URL || null
  const kind = installKind()
  if (!app.isPackaged || !kind) {
    set({
      status: 'unsupported',
      message: !app.isPackaged
        ? 'This copy runs from the source folder, so it can’t update itself. Install justNotes from the Releases page on GitHub to get updates here.'
        : 'Only the installed versions (Windows installer, .deb or AppImage) can update themselves.'
    })
    if (!testUrl) return
  }
  // Use the installer that matches how this copy was installed (Windows runs the new installer
  // quietly; an AppImage replaces its own file; the .deb goes through the system's package manager).
  const { AppImageUpdater, DebUpdater, NsisUpdater } = await import('electron-updater')
  const autoUpdater = kind === 'nsis' ? new NsisUpdater() : kind === 'deb' ? new DebUpdater() : new AppImageUpdater()
  updater = autoUpdater
  allowUpdaterHosts(testUrl ? new URL(testUrl).host : null)
  autoUpdater.autoDownload = true // downloaded in the background, installed only when you click Install
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = { info: () => {}, warn: (m: unknown) => console.warn('Updater:', m), error: (m: unknown) => console.error('Updater:', m), debug: () => {} }
  if (testUrl) {
    autoUpdater.forceDevUpdateConfig = !app.isPackaged
    autoUpdater.setFeedURL({ provider: 'generic', url: testUrl })
  }
  if (kind || testUrl) set({ status: 'idle', kind: kind ?? 'appimage', message: undefined })

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', message: undefined }))
  autoUpdater.on('update-not-available', () => set({ status: 'none', checkedAt: new Date().toISOString() }))
  autoUpdater.on('update-available', (info) =>
    set({ status: 'downloading', version: info.version, notes: notesText(info.releaseNotes), percent: 0, checkedAt: new Date().toISOString() })
  )
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version, notes: notesText(info.releaseNotes) ?? state.notes, percent: 100 }))
  autoUpdater.on('error', (err) => {
    // A failed check or download leaves an already-downloaded update in place.
    if (state.status !== 'ready') set({ status: 'error', message: friendly(err) })
  })
}

export const getUpdateState = (): UpdateState => state

export async function checkForUpdates(): Promise<UpdateState> {
  if (!updater || state.status === 'unsupported' || state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') return state
  try {
    await updater.checkForUpdates()
  } catch (err) {
    if (getUpdateState().status !== 'ready') set({ status: 'error', message: friendly(err) })
  }
  return state
}

/** Installs the downloaded update and restarts (the window saves its pages first). */
export function installUpdate(): void {
  if (!updater || state.status !== 'ready') return
  set({ status: 'installing' })
  // The .deb asks for your password (pkexec/sudo); the AppImage replaces itself.
  setImmediate(() => updater!.quitAndInstall(true, true))
}
