// App shell. One notebook is open at a time: its sections are the tabs under
// the ribbon, and the selected section's pages are listed in the sidebar.
// Other notebooks are reached through File ▸ Open notebook.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EngineError, Result, Tree } from '../../shared/types'
import { ConfirmDialog, type ConfirmRequest } from './components/ConfirmDialog'
import { ContextMenu, type MenuItem } from './components/ContextMenu'
import { MoveDialog } from './components/MoveDialog'
import { NotebookDialog, type NotebookDialogMode } from './components/NotebookDialog'
import { PageView } from './components/PageView'
import { Ribbon, type PageMode } from './components/Ribbon'
import { SectionTabs } from './components/SectionTabs'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar, type Editing, type PageRow, type SidebarActions } from './components/Sidebar'
import { flushAllSaves } from './editor/saveCoordinator'
import { useSettings } from './lib/settings'
import { load, save } from './lib/storage'
import { existsIn, isWithin, kindOf, nameOf, nearestExisting, parentOf, refOf, remapKey } from './lib/tree'

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

const remapRecord = (rec: Record<string, string>, from: string, to: string) =>
  Object.fromEntries(Object.entries(rec).map(([k, v]) => [remapKey(k, from, to), remapKey(v, from, to)]))

export function App() {
  const [tree, setTree] = useState<Tree | null>(null)
  // A section key ("Notebook/Section") or page key ("Notebook/Section/Page"), or a
  // notebook key when the notebook has no sections. Its notebook is the open one.
  const [selectedKey, setSelectedKey] = useState<string | null>(() => load<string | null>('jn.selected', null))
  const [editing, setEditing] = useState<Editing | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; key: string | null } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [notebookDialog, setNotebookDialog] = useState<NotebookDialogMode | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null) // non-error notices, e.g. "Moved …"
  const [moving, setMoving] = useState<string | null>(null) // page key being moved
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settings = useSettings()
  const [width, setWidth] = useState(() => load('jn.sidebarWidth', 260))
  const [theme, setTheme] = useState<'dark' | 'light'>(() => load('jn.theme', 'dark'))
  const [sidebarVisible, setSidebarVisible] = useState(() => load('jn.sidebarVisible', true))
  // Per page: show the text page or its whiteboard (remembered between runs).
  const [pageModes, setPageModes] = useState<Record<string, PageMode>>(() => load('jn.pageModes', {}))
  // Where you were last: notebook → section key, section key → page key.
  const [lastSection, setLastSection] = useState<Record<string, string>>(() => load('jn.lastSection', {}))
  const [lastPage, setLastPage] = useState<Record<string, string>>(() => load('jn.lastPage', {}))
  const [zoom, setZoom] = useState(1)
  const firstLoad = useRef(true)
  const remembered = useRef({ lastSection, lastPage })
  remembered.current = { lastSection, lastPage }

  useEffect(() => save('jn.selected', selectedKey), [selectedKey])
  useEffect(() => save('jn.sidebarWidth', width), [width])
  useEffect(() => save('jn.sidebarVisible', sidebarVisible), [sidebarVisible])
  useEffect(() => save('jn.pageModes', pageModes), [pageModes])
  useEffect(() => save('jn.lastSection', lastSection), [lastSection])
  useEffect(() => save('jn.lastPage', lastPage), [lastPage])
  useEffect(() => {
    save('jn.theme', theme)
    document.documentElement.dataset.theme = theme
    void api.setTheme(theme)
  }, [theme])

  // Remember the section and page being viewed, to come back to them later.
  useEffect(() => {
    if (!selectedKey) return
    const { notebook, section } = refOf(selectedKey)
    if (section === undefined) return
    const secKey = `${notebook}/${section}`
    setLastSection((p) => (p[notebook] === secKey ? p : { ...p, [notebook]: secKey }))
    if (kindOf(selectedKey) === 'page') setLastPage((p) => (p[secKey] === selectedKey ? p : { ...p, [secKey]: selectedKey }))
  }, [selectedKey])

  useEffect(() => {
    if (!info) return
    const t = setTimeout(() => setInfo(null), 4000)
    return () => clearTimeout(t)
  }, [info])

  // Errors that aren't shown inline appear as a toast for a few seconds.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  /**
   * Where to land when opening a notebook or section: the section/page you
   * were last on, else the first one.
   */
  const landing = useCallback((t: Tree, key: string): string => {
    const { lastSection: ls, lastPage: lp } = remembered.current
    let k = key
    if (kindOf(k) === 'notebook') {
      const nb = t.notebooks.find((n) => n.name === k)
      if (!nb) return k
      const remembered = ls[k]
      if (remembered && isWithin(remembered, k) && existsIn(t, remembered)) k = remembered
      else if (nb.sections[0]) k = `${nb.name}/${nb.sections[0].name}`
      else return k
    }
    if (kindOf(k) === 'section') {
      const { notebook, section } = refOf(k)
      const sec = t.notebooks.find((n) => n.name === notebook)?.sections.find((s) => s.name === section)
      if (!sec) return k
      const remembered = lp[k]
      // (a page moved elsewhere no longer counts as "last page here")
      if (remembered && isWithin(remembered, k) && existsIn(t, remembered)) return remembered
      if (sec.pages[0]) return `${k}/${sec.pages[0].name}`
    }
    return k
  }, [])

  const refresh = useCallback(async (): Promise<Tree | null> => {
    const r = await api.listTree()
    if (!r.ok) {
      setToast(r.error.message)
      return null
    }
    const t = r.data
    const isFirstLoad = firstLoad.current // read now: the updater below runs later
    firstLoad.current = false
    setTree(t)
    setSelectedKey((k) => {
      if (k !== null) {
        if (existsIn(t, k)) return k
        // The item vanished (deleted/renamed outside the app): go to what's left of it.
        const near = nearestExisting(t, k)
        return near === null ? null : landing(t, near)
      }
      // On start-up, reopen a notebook rather than showing nothing.
      if (isFirstLoad && t.notebooks[0]) return landing(t, t.notebooks[0].name)
      return null
    })
    return t
  }, [landing])

  useEffect(() => {
    void refresh()
    return api.onChanged(() => void refresh())
  }, [refresh])

  // Page font and size from Settings.
  useEffect(() => {
    const root = document.documentElement.style
    const f = settings.editorFont
    root.setProperty('--editor-font', f ? (['serif', 'monospace', 'sans-serif'].includes(f) ? f : `'${f}', system-ui, sans-serif`) : 'inherit')
    root.setProperty('--editor-size', `${settings.editorFontSize}px`)
  }, [settings.editorFont, settings.editorFontSize])

  // Ctrl+, opens Settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Unsaved edits are written before the window closes.
  useEffect(() => api.onBeforeClose(flushAllSaves), [])

  // ----- what's open -----
  const openNotebookName = selectedKey ? refOf(selectedKey).notebook : null
  const notebook = tree?.notebooks.find((n) => n.name === openNotebookName) ?? null
  const selectedKind = selectedKey ? kindOf(selectedKey) : null
  const sectionKey = selectedKey && selectedKind !== 'notebook' ? (selectedKind === 'page' ? parentOf(selectedKey) : selectedKey) : null
  const section = sectionKey ? notebook?.sections.find((s) => s.name === nameOf(sectionKey)) ?? null : null
  const pages: PageRow[] = useMemo(
    () => (section && sectionKey ? section.pages.map((p) => ({ key: `${sectionKey}/${p.name}`, name: p.name, path: p.path, hasCanvas: p.hasCanvas })) : []),
    [section, sectionKey]
  )

  /** Toast for a failed result; returns true if it succeeded. */
  const check = (r: Result<unknown>): boolean => {
    if (!r.ok) setToast(r.error.message)
    return r.ok
  }

  const openNotebook = (name: string) => {
    setNotebookDialog(null)
    if (tree) setSelectedKey(landing(tree, name))
  }
  const selectSection = (key: string) => {
    if (tree) setSelectedKey(landing(tree, key))
  }

  // ----- create / rename -----
  const startCreate = (parentKey: string | null) => {
    if (parentKey === null) return setNotebookDialog({ mode: 'new' })
    // "New page" on a page means a sibling page in the same section.
    const parent = kindOf(parentKey) === 'page' ? parentOf(parentKey)! : parentKey
    const kind = kindOf(parent) === 'notebook' ? 'section' : 'page'
    if (kind === 'page') setSidebarVisible(true) // page names are typed into the sidebar
    setEditing({ mode: 'create', parentKey: parent, kind, error: null })
  }

  const startRename = (key: string) => {
    if (kindOf(key) === 'notebook') return setNotebookDialog({ mode: 'rename', notebook: key })
    if (kindOf(key) === 'page') {
      setSidebarVisible(true)
      setSelectedKey(key)
    }
    setEditing({ mode: 'rename', key, error: null })
  }

  /** Keeps everything that refers to a renamed item pointing at its new name. */
  const remapAll = (from: string, to: string) => {
    setSelectedKey((k) => (k ? remapKey(k, from, to) : k))
    setPageModes((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [remapKey(k, from, to), v])))
    setLastSection((prev) => remapRecord(prev, from, to))
    setLastPage((prev) => remapRecord(prev, from, to))
  }

  const submitEdit = async (value: string, viaBlur: boolean) => {
    if (!editing) return
    let result: Result<{ name: string } | string>
    let newKey: (name: string) => string

    if (editing.mode === 'create') {
      const p = refOf(editing.parentKey!)
      result = editing.kind === 'section' ? await api.createSection(p.notebook, value) : await api.createPage(p.notebook, p.section!, value)
      newKey = (name) => `${editing.parentKey}/${name}`
    } else {
      await flushAllSaves() // unsaved edits must land in the file before it moves
      const { notebook, section, page } = refOf(editing.key)
      result = kindOf(editing.key) === 'section' ? await api.renameSection(notebook, section!, value) : await api.renamePage(notebook, section!, page!, value)
      const parent = parentOf(editing.key)
      newKey = (name) => `${parent}/${name}`
    }

    if (!result.ok) {
      // Enter keeps the box open so the name can be fixed; clicking away gives up.
      if (viaBlur) {
        setEditing(null)
        setToast(result.error.message)
      } else setEditing({ ...editing, error: result.error.message })
      return
    }

    const key = newKey(typeof result.data === 'string' ? result.data : result.data.name)
    setEditing(null)
    if (editing.mode === 'rename') remapAll(editing.key, key)
    else setSelectedKey(key)
    await refresh()
  }

  const createNotebook = async (name: string): Promise<EngineError | null> => {
    const r = await api.createNotebook(name)
    if (!r.ok) return r.error
    setNotebookDialog(null)
    await refresh()
    setSelectedKey(r.data.name)
    return null
  }

  const renameNotebook = async (oldName: string, name: string): Promise<EngineError | null> => {
    await flushAllSaves()
    const r = await api.renameNotebook(oldName, name)
    if (!r.ok) return r.error
    setNotebookDialog(null)
    remapAll(oldName, r.data)
    await refresh()
    return null
  }

  // ----- delete -----
  const remove = async (key: string) => {
    await flushAllSaves()
    const { notebook: nb, section: sec, page } = refOf(key)
    const kind = kindOf(key)
    const afterDelete = async () => {
      const t = await refresh()
      // Move to a neighbour of what was deleted (another page / section), or close the notebook.
      setSelectedKey((k) => {
        if (!k || !isWithin(k, key)) return k
        const parent = parentOf(key)
        return parent && t ? landing(t, parent) : null
      })
    }

    if (kind === 'page') {
      setConfirm({
        title: `Delete page "${page}"?`,
        message: `"${page}.md" will be permanently deleted from disk.`,
        confirmLabel: 'Delete page',
        onConfirm: async () => {
          if (check(await api.deletePage(nb, sec!, page!))) await afterDelete()
        }
      })
      return
    }

    const del = (force: boolean) => (kind === 'notebook' ? api.deleteNotebook(nb, { force }) : api.deleteSection(nb, sec!, { force }))
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

  // ----- move a page to another section -----
  const movePage = async (key: string, toNotebook: string, toSection: string): Promise<EngineError | null> => {
    await flushAllSaves() // unsaved edits go with the page
    const { notebook: nb, section: sec, page } = refOf(key)
    const r = await api.movePage(nb, sec!, page!, toNotebook, toSection)
    if (!r.ok) return r.error
    setMoving(null)
    const newKey = `${toNotebook}/${toSection}/${r.data}`
    const wasOpen = selectedKey === key
    remapAll(key, newKey)
    const t = await refresh()
    // Stay in this section (you may be tidying several pages); open its next page.
    if (wasOpen && t) setSelectedKey(landing(t, `${nb}/${sec}`))
    setInfo(`Moved "${page}" to ${toNotebook === nb ? '' : `${toNotebook} › `}${toSection}`)
    return null
  }

  const showInFolder = async (key: string) => void check(await api.showInFolder(refOf(key)))
  const openRootFolder = async () => void check(await api.openRootFolder())

  const sidebarActions: SidebarActions = {
    select: setSelectedKey,
    startCreate,
    startRename,
    submitEdit: (v, b) => void submitEdit(v, b),
    cancelEdit: () => setEditing(null),
    remove: (k) => void remove(k),
    openMenu: (x, y, key) => setMenu({ x, y, key })
  }

  const menuItems = (key: string | null): (MenuItem | 'sep')[] => {
    if (key === null) return [{ label: 'Open notebook…', onClick: () => setNotebookDialog({ mode: 'open' }) }]
    const kind = kindOf(key)
    if (kind === 'notebook') {
      return [
        { label: 'New section', onClick: () => startCreate(key) },
        { label: 'Rename notebook…', onClick: () => startRename(key) },
        { label: 'Show in file manager', onClick: () => void showInFolder(key) },
        'sep',
        { label: 'Delete notebook', danger: true, onClick: () => void remove(key) }
      ]
    }
    return [
      { label: 'New page', onClick: () => startCreate(kind === 'section' ? key : parentOf(key)) },
      ...(kind === 'section' ? [{ label: 'New section', onClick: () => startCreate(parentOf(key)) }] : []),
      { label: 'Rename', shortcut: 'F2', onClick: () => startRename(key) },
      ...(kind === 'page' ? [{ label: 'Move…', onClick: () => setMoving(key) }] : []),
      { label: 'Show in file manager', onClick: () => void showInFolder(key) },
      'sep',
      { label: kind === 'section' ? 'Delete section' : 'Delete page', shortcut: kind === 'page' ? 'Del' : undefined, danger: true, onClick: () => void remove(key) }
    ]
  }

  // ----- page / whiteboard mode -----
  const mode: PageMode = selectedKey && selectedKind === 'page' ? (pageModes[selectedKey] ?? 'page') : 'page'
  const setMode = (m: PageMode) => {
    if (!selectedKey || selectedKind !== 'page') return
    void flushAllSaves()
    setPageModes((prev) => {
      const next = { ...prev }
      if (m === 'page') delete next[selectedKey]
      else next[selectedKey] = m
      return next
    })
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
    <div className="app-shell">
      <Ribbon
        notebookKey={notebook?.name ?? null}
        sectionKey={sectionKey}
        hasPage={selectedKind === 'page'}
        mode={mode}
        setMode={setMode}
        startCreate={startCreate}
        onOpenNotebook={() => setNotebookDialog({ mode: 'open' })}
        onRenameNotebook={() => notebook && startRename(notebook.name)}
        onDeleteNotebook={() => notebook && void remove(notebook.name)}
        onRevealNotebook={() => notebook && void showInFolder(notebook.name)}
        onOpenSettings={() => setSettingsOpen(true)}
        sidebarVisible={sidebarVisible}
        toggleSidebar={() => setSidebarVisible((v) => !v)}
        theme={theme}
        setTheme={setTheme}
        zoom={zoom}
        onZoom={(d) => setZoom(api.zoom(d))}
        openRootFolder={() => void openRootFolder()}
        revealPage={() => selectedKey && void showInFolder(selectedKey)}
      />
      <SectionTabs
        notebook={notebook}
        sectionKey={sectionKey}
        editing={editing}
        select={selectSection}
        startCreate={startCreate}
        startRename={startRename}
        submitEdit={(v, b) => void submitEdit(v, b)}
        cancelEdit={() => setEditing(null)}
        openMenu={(x, y, key) => setMenu({ x, y, key })}
        openNotebookPicker={() => setNotebookDialog({ mode: 'open' })}
      />
      <div className={`layout${sidebarVisible && notebook ? '' : ' no-sidebar'}`} style={{ '--sidebar-width': `${width}px` } as React.CSSProperties}>
        {sidebarVisible && notebook && (
          <>
            <Sidebar sectionKey={sectionKey} sectionName={section?.name ?? null} pages={pages} selectedKey={selectedKey} editing={editing} actions={sidebarActions} />
            <div className="resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onMouseDown={startResize} onDoubleClick={() => setWidth(260)} />
          </>
        )}
        <PageView
          tree={tree}
          selectedKey={selectedKey}
          select={setSelectedKey}
          startCreate={startCreate}
          notify={setToast}
          mode={mode}
          setMode={setMode}
          theme={theme}
          onOpenNotebook={() => setNotebookDialog({ mode: 'open' })}
        />
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.key)} onClose={() => setMenu(null)} />}
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
      {notebookDialog && tree && (
        <NotebookDialog
          state={notebookDialog}
          tree={tree}
          openNotebook={notebook?.name ?? null}
          onOpen={openNotebook}
          onCreate={createNotebook}
          onRename={renameNotebook}
          setMode={setNotebookDialog}
          onClose={() => setNotebookDialog(null)}
        />
      )}
      {settingsOpen && <SettingsDialog theme={theme} setTheme={setTheme} onClose={() => setSettingsOpen(false)} />}
      {moving && tree && (
        <MoveDialog tree={tree} pageKey={moving} onMove={(nb, sec) => movePage(moving, nb, sec)} onClose={() => setMoving(null)} />
      )}
      {info && !toast && (
        <div className="toast info" role="status">
          <span>{info}</span>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setInfo(null)}>
            ×
          </button>
        </div>
      )}
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
