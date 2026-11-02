// App shell: owns the tree data, selection, expanded folders and edit state,
// and turns sidebar actions into file-engine calls.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EngineError, Result, Tree } from '../../shared/types'
import { ConfirmDialog, type ConfirmRequest } from './components/ConfirmDialog'
import { ContextMenu, type MenuItem } from './components/ContextMenu'
import { PageView } from './components/PageView'
import { childKindOf, Sidebar, type Editing, type SidebarActions } from './components/Sidebar'
import { load, save } from './lib/storage'
import { isWithin, kindOf, nameOf, nearestExisting, parentOf, refOf, remapKey, visibleRows } from './lib/tree'

const api = window.wiki
const MIN_WIDTH = 180
const MAX_WIDTH = 520

function describeContents(c: EngineError['contents']): string {
  if (!c) return 'some files'
  const parts: string[] = []
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
  if (c.sections) parts.push(n(c.sections, 'section'))
  if (c.pages) parts.push(n(c.pages, 'page'))
  if (c.otherFiles) parts.push(n(c.otherFiles, 'other file'))
  return parts.join(', ')
}

export function App() {
  const [tree, setTree] = useState<Tree | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(load<string[]>('jn.expanded', [])))
  const [selectedKey, setSelectedKey] = useState<string | null>(() => load<string | null>('jn.selected', null))
  const [editing, setEditing] = useState<Editing | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; key: string | null } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [width, setWidth] = useState(() => load('jn.sidebarWidth', 260))
  const firstLoad = useRef(!localStorage.getItem('jn.expanded'))

  useEffect(() => save('jn.expanded', [...expanded]), [expanded])
  useEffect(() => save('jn.selected', selectedKey), [selectedKey])
  useEffect(() => save('jn.sidebarWidth', width), [width])

  // Errors that aren't shown inline appear as a toast for a few seconds.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const refresh = useCallback(async () => {
    const r = await api.listTree()
    if (!r.ok) return setToast(r.error.message)
    setTree(r.data)
    if (firstLoad.current) {
      // First run: show every notebook open.
      firstLoad.current = false
      setExpanded(new Set(r.data.notebooks.map((n) => n.name)))
    }
    // If the selected item vanished (deleted or renamed outside the app), fall back to its nearest parent.
    setSelectedKey((k) => (k === null ? null : nearestExisting(r.data, k)))
  }, [])

  useEffect(() => {
    void refresh()
    return api.onChanged(() => void refresh())
  }, [refresh])

  const rows = useMemo(() => (tree ? visibleRows(tree, expanded) : []), [tree, expanded])

  /** Toast for a failed result; returns true if it succeeded. */
  const check = (r: Result<unknown>): boolean => {
    if (!r.ok) setToast(r.error.message)
    return r.ok
  }

  const toggle = useCallback((key: string, open?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      const shouldOpen = open ?? !next.has(key)
      if (shouldOpen) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const expand = (...keys: (string | null)[]) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const k of keys) if (k) next.add(k)
      return next
    })

  const startCreate = (parentKey: string | null) => {
    // "New page" on a page means a sibling page in the same section.
    const parent = parentKey && kindOf(parentKey) === 'page' ? parentOf(parentKey) : parentKey
    if (parent) expand(parentOf(parent), parent)
    setEditing({ mode: 'create', parentKey: parent, kind: childKindOf(parent), error: null })
  }

  const startRename = (key: string) => {
    expand(parentOf(key))
    setSelectedKey(key)
    setEditing({ mode: 'rename', key, error: null })
  }

  const submitEdit = async (value: string, viaBlur: boolean) => {
    if (!editing) return
    let result: Result<{ name: string } | string>
    let newKey: (name: string) => string

    if (editing.mode === 'create') {
      const p = editing.parentKey ? refOf(editing.parentKey) : null
      result =
        editing.kind === 'notebook'
          ? await api.createNotebook(value)
          : editing.kind === 'section'
            ? await api.createSection(p!.notebook, value)
            : await api.createPage(p!.notebook, p!.section!, value)
      newKey = (name) => (editing.parentKey ? `${editing.parentKey}/${name}` : name)
    } else {
      const { notebook, section, page } = refOf(editing.key)
      const kind = kindOf(editing.key)
      result =
        kind === 'notebook'
          ? await api.renameNotebook(notebook, value)
          : kind === 'section'
            ? await api.renameSection(notebook, section!, value)
            : await api.renamePage(notebook, section!, page!, value)
      const parent = parentOf(editing.key)
      newKey = (name) => (parent ? `${parent}/${name}` : name)
    }

    if (!result.ok) {
      // Enter keeps the box open so the name can be fixed; clicking away gives up.
      if (viaBlur) {
        setEditing(null)
        setToast(result.error.message)
      } else setEditing({ ...editing, error: result.error.message })
      return
    }

    const name = typeof result.data === 'string' ? result.data : result.data.name
    const key = newKey(name)
    if (editing.mode === 'rename') {
      const from = editing.key
      setExpanded((prev) => new Set([...prev].map((k) => remapKey(k, from, key))))
    } else if (editing.kind !== 'page') {
      expand(key)
    }
    setEditing(null)
    setSelectedKey(key)
    await refresh()
  }

  const remove = async (key: string) => {
    const { notebook, section, page } = refOf(key)
    const kind = kindOf(key)
    const afterDelete = async () => {
      setSelectedKey((k) => (k && isWithin(k, key) ? parentOf(key) : k))
      await refresh()
    }

    if (kind === 'page') {
      setConfirm({
        title: `Delete page "${page}"?`,
        message: `"${page}.md" will be permanently deleted from disk.`,
        confirmLabel: 'Delete page',
        onConfirm: async () => {
          if (check(await api.deletePage(notebook, section!, page!))) await afterDelete()
        }
      })
      return
    }

    const del = (force: boolean) =>
      kind === 'notebook' ? api.deleteNotebook(notebook, { force }) : api.deleteSection(notebook, section!, { force })
    const r = await del(false)
    if (r.ok) return afterDelete()
    if (r.error.code !== 'NOT_EMPTY') return void check(r)
    setConfirm({
      title: `Delete ${kind} "${nameOf(key)}"?`,
      message: `It contains ${describeContents(r.error.contents)}. Everything inside will be permanently deleted from disk.`,
      confirmLabel: 'Delete everything',
      onConfirm: async () => {
        if (check(await del(true))) await afterDelete()
      }
    })
  }

  const actions: SidebarActions = {
    toggle,
    select: setSelectedKey,
    startCreate,
    startRename,
    submitEdit: (v, b) => void submitEdit(v, b),
    cancelEdit: () => setEditing(null),
    remove: (k) => void remove(k),
    openMenu: (x, y, key) => setMenu({ x, y, key }),
    openRootFolder: async () => void check(await api.openRootFolder())
  }

  const menuItems = (key: string | null): (MenuItem | 'sep')[] => {
    if (key === null) {
      return [
        { label: 'New notebook', onClick: () => startCreate(null) },
        { label: 'Open WikiBook folder', onClick: actions.openRootFolder }
      ]
    }
    const kind = kindOf(key)
    const showInFolder = async () => void check(await api.showInFolder(refOf(key)))
    return [
      kind === 'notebook'
        ? { label: 'New section', onClick: () => startCreate(key) }
        : { label: 'New page', onClick: () => startCreate(kind === 'section' ? key : parentOf(key)) },
      { label: 'Rename', shortcut: 'F2', onClick: () => startRename(key) },
      { label: 'Show in file manager', onClick: () => void showInFolder() },
      'sep',
      { label: 'Delete', shortcut: 'Del', danger: true, onClick: () => void remove(key) }
    ]
  }

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: MouseEvent) => setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + ev.clientX - startX)))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('resizing')
    }
    document.body.classList.add('resizing')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className="layout" style={{ '--sidebar-width': `${width}px` } as React.CSSProperties}>
      <Sidebar tree={tree} rows={rows} expanded={expanded} selectedKey={selectedKey} editing={editing} actions={actions} />
      <div
        className="resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={startResize}
        onDoubleClick={() => setWidth(260)}
      />
      <PageView tree={tree} selectedKey={selectedKey} select={setSelectedKey} startCreate={startCreate} />

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.key)} onClose={() => setMenu(null)} />}
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
      {toast && (
        <div className="toast" role="alert">
          <span>{toast}</span>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
