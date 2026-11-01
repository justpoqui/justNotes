// Runs in an isolated context. Exposes only the typed `window.wiki` API —
// the renderer never gets direct access to Node, fs or ipcRenderer.

import { contextBridge, ipcRenderer } from 'electron'
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
  openRootFolder: call('openRootFolder')
} as WikiApi

contextBridge.exposeInMainWorld('wiki', api)
