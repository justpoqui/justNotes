// Runs in an isolated context. Exposes only the typed `window.wiki` API —
// the renderer never gets direct access to Node, fs or ipcRenderer.

import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type { WikiApi } from '../shared/types'

const call =
  (name: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(`wiki:${name}`, ...args)

const api: WikiApi = {
  getRoot: call('getRoot'),
  listTree: call('listTree'),
  createNotebook: call('createNotebook'),
  renameNotebook: call('renameNotebook'),
  deleteNotebook: call('deleteNotebook'),
  createSection: call('createSection'),
  renameSection: call('renameSection'),
  deleteSection: call('deleteSection'),
  createPage: call('createPage'),
  renamePage: call('renamePage'),
  deletePage: call('deletePage'),
  duplicatePage: call('duplicatePage'),
  setOrder: call('setOrder'),
  setNotebookOrder: call('setNotebookOrder'),
  setPageLevels: call('setPageLevels'),
  setSectionColor: call('setSectionColor'),
  appendToPage: call('appendToPage'),
  listTrash: call('listTrash'),
  restoreFromTrash: call('restoreFromTrash'),
  emptyTrash: call('emptyTrash'),
  listVersions: call('listVersions'),
  readVersion: call('readVersion'),
  restoreVersion: call('restoreVersion'),
  saveVersion: call('saveVersion'),
  exportNotebook: call('exportNotebook'),
  importNotebook: call('importNotebook'),
  runAutoBackup: call('runAutoBackup'),
  chooseBackupFolder: call('chooseBackupFolder'),
  defaultBackupFolder: call('defaultBackupFolder'),
  openBackupFolder: call('openBackupFolder'),
  movePage: call('movePage'),
  readPage: call('readPage'),
  writePage: call('writePage'),
  readCanvas: call('readCanvas'),
  writeCanvas: call('writeCanvas'),
  setTheme: call('setTheme'),
  setAppZoom: (factor) => {
    webFrame.setZoomFactor(Math.min(2, Math.max(0.5, Number(factor) || 1)))
  },
  saveAsset: call('saveAsset'),
  pickImage: call('pickImage'),
  openRootFolder: call('openRootFolder'),
  showInFolder: call('showInFolder'),
  onBeforeClose: (flush) => {
    const listener = async () => {
      try {
        await flush()
      } finally {
        ipcRenderer.send('app:ready-to-close')
      }
    }
    ipcRenderer.on('app:flush-before-close', listener)
    return () => {
      ipcRenderer.removeListener('app:flush-before-close', listener)
    }
  },
  exportPdf: call('exportPdf'),
  listFonts: call('listFonts'),
  editCommand: (cmd) => ipcRenderer.send('edit:command', cmd),
  windowControls: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
    close: () => ipcRenderer.send('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
    onMaximizedChange: (callback) => {
      const listener = (_e: unknown, maximized: boolean) => callback(maximized)
      ipcRenderer.on('win:maximized', listener)
      return () => {
        ipcRenderer.removeListener('win:maximized', listener)
      }
    }
  },
  getUpdateState: call('getUpdateState'),
  checkForUpdates: call('checkForUpdates'),
  installUpdate: call('installUpdate'),
  onUpdateState: (callback) => {
    const listener = (_e: unknown, state: Parameters<typeof callback>[0]) => callback(state)
    ipcRenderer.on('update:state', listener)
    return () => {
      ipcRenderer.removeListener('update:state', listener)
    }
  },
  onChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('wiki:changed', listener)
    return () => {
      ipcRenderer.removeListener('wiki:changed', listener)
    }
  }
} as WikiApi

contextBridge.exposeInMainWorld('wiki', api)
