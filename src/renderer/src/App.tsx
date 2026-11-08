// App shell. One notebook is open at a time: its sections are the tabs under
// the ribbon, and the selected section's pages are listed in the sidebar.
// Other notebooks are reached through File ▸ Open notebook.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EngineError, Result, Tree } from '../../shared/types'
import { ConfirmDialog, type ConfirmRequest } from './components/ConfirmDialog'
import { ContextMenu, type MenuItem, type MenuSwatches } from './components/ContextMenu'
import { HistoryDialog, ShortcutsDialog, TemplateDialog, TrashDialog } from './components/Dialogs'
import { MoveDialog } from './components/MoveDialog'
import { NotebookDialog, type NotebookDialogMode } from './components/NotebookDialog'
import { PageView } from './components/PageView'
import { QuickOpen } from './components/QuickOpen'
import { UpdateDialog } from './components/UpdateDialog'
import { AboutDialog } from './components/AboutDialog'
import { Ribbon, type PageMode } from './components/Ribbon'
import { nextSectionColor, SECTION_COLORS, SectionTabs } from './components/SectionTabs'
import { SettingsDialog } from './components/SettingsDialog'
import { StatusBar } from './components/StatusBar'
import { Sidebar, type Editing, type PageRow, type SidebarActions } from './components/Sidebar'
import { flushAllSaves } from './editor/saveCoordinator'
import { getSettings, updateSettings, useSettings } from './lib/settings'
import { getActivePage } from './editor/activePage'
import { ZOOM_MAX, ZOOM_MIN } from './components/StatusBar'
import { load, save } from './lib/storage'
import { startAutoBackup } from './lib/autoBackup'
import { ancestorsOf, blockEnd, shiftLevel as shiftLevels } from './lib/subpages'
import { WELCOME_NOTEBOOK, WELCOME_PAGE, WELCOME_SECTION, WELCOME_TEXT } from './lib/welcome'
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
  // Non-error notices, e.g. "Moved …", optionally with a button such as Undo.
  const [info, setInfoState] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null)
  const setInfo = (text: string, action?: { label: string; run: () => void }) => setInfoState({ text, action })
  const [templateFor, setTemplateFor] = useState<string | null>(null) // section key
  const [trashOpen, setTrashOpen] = useState(false)
  const [historyFor, setHistoryFor] = useState<string | null>(null) // page key
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [updatesOpen, setUpdatesOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  // Recently opened and favorite pages (keys), remembered between runs.
  const [recent, setRecent] = useState<string[]>(() => load('jn.recent', []))
  const [favorites, setFavorites] = useState<string[]>(() => load('jn.favourites', []))
  const [moving, setMoving] = useState<string | null>(null) // page key being moved
  // Pages whose subpages are folded away in the sidebar (keys), remembered between runs.
  const [folded, setFolded] = useState<Set<string>>(() => new Set(load<string[]>('jn.folded', [])))
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
  const firstLoad = useRef(true)
  const remembered = useRef({ lastSection, lastPage })
  remembered.current = { lastSection, lastPage }

  useEffect(() => save('jn.selected', selectedKey), [selectedKey])
  useEffect(() => save('jn.sidebarWidth', width), [width])
  useEffect(() => save('jn.sidebarVisible', sidebarVisible), [sidebarVisible])
  useEffect(() => save('jn.pageModes', pageModes), [pageModes])
  useEffect(() => save('jn.lastSection', lastSection), [lastSection])
  useEffect(() => save('jn.lastPage', lastPage), [lastPage])
  useEffect(() => save('jn.recent', recent), [recent])
  useEffect(() => save('jn.folded', [...folded]), [folded])
  useEffect(() => save('jn.favourites', favorites), [favorites])
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
    if (kindOf(selectedKey) === 'page') {
      setLastPage((p) => (p[secKey] === selectedKey ? p : { ...p, [secKey]: selectedKey }))
      setRecent((r) => (r[0] === selectedKey ? r : [selectedKey, ...r.filter((k) => k !== selectedKey)].slice(0, 12)))
    }
  }, [selectedKey])

  useEffect(() => {
    if (!info) return
    const t = setTimeout(() => setInfoState(null), info.action ? 8000 : 4000)
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
    let t = r.data
    const isFirstLoad = firstLoad.current // read now: the updater below runs later
    firstLoad.current = false
    // The very first start: make a notebook with a short welcome page instead of an empty window.
    if (isFirstLoad && !load('jn.welcomed', false)) {
      save('jn.welcomed', true)
      if (t.notebooks.length === 0) {
        const nb = await api.createNotebook(WELCOME_NOTEBOOK)
        const sec = nb.ok && (await api.createSection(WELCOME_NOTEBOOK, WELCOME_SECTION))
        const page = sec && sec.ok && (await api.createPage(WELCOME_NOTEBOOK, WELCOME_SECTION, WELCOME_PAGE, WELCOME_TEXT))
        const again = await api.listTree()
        if (again.ok) t = again.data
        if (page && page.ok) {
          setTree(t)
          setSelectedKey(`${WELCOME_NOTEBOOK}/${WELCOME_SECTION}/${WELCOME_PAGE}`)
          return t
        }
      }
    }
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
  useEffect(() => {
    document.documentElement.dataset.pageWidth = settings.pageWidth
  }, [settings.pageWidth])

  // App size (Settings → General) is remembered between runs.
  useEffect(() => {
    api.setAppZoom(settings.appZoom || 1)
  }, [settings.appZoom])

  // App-wide keyboard shortcuts (the cheat-sheet is F1). Kept in a ref so the
  // listener always sees the current state.
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {})
  shortcutRef.current = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey
    const dialogOpen = !!document.querySelector('.backdrop')
    if (e.key === 'F1' || (ctrl && e.key === '/')) {
      e.preventDefault()
      return setShortcutsOpen(true)
    }
    if (!ctrl || e.altKey) return
    // Ctrl+P: go to any page or section by typing part of its name.
    if (e.key.toLowerCase() === 'p' && !e.shiftKey && !dialogOpen) {
      e.preventDefault()
      return setQuickOpen(true)
    }
    if (e.key === ',') {
      e.preventDefault()
      return setSettingsOpen(true)
    }
    // Page zoom: Ctrl+= / Ctrl+- / Ctrl+0
    const zoom = getSettings().pageZoom || 1
    const setZoom = (z: number) => updateSettings({ pageZoom: Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100 })
    if (e.key === '=' || e.key === '+') return (e.preventDefault(), setZoom(zoom + 0.1))
    if (e.key === '-' || e.key === '_') return (e.preventDefault(), setZoom(zoom - 0.1))
    if (e.key === '0') return (e.preventDefault(), setZoom(1))
    if (dialogOpen || !notebook) return
    const k = e.key.toLowerCase()
    if (k === 'n' && !e.shiftKey && sectionKey) return (e.preventDefault(), startCreate(sectionKey))
    if (k === 'n' && e.shiftKey) return (e.preventDefault(), startCreate(notebook.name))
    if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault()
      const i = pages.findIndex((p) => p.key === selectedKey)
      const next = pages[i + (e.key === 'PageDown' ? 1 : -1)]
      if (next) setSelectedKey(next.key)
      return
    }
    if (e.key === 'Tab' && notebook.sections.length > 1) {
      e.preventDefault()
      const list = notebook.sections
      const i = list.findIndex((x) => `${notebook.name}/${x.name}` === sectionKey)
      const next = list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length]
      selectSection(`${notebook.name}/${next.name}`)
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcutRef.current(e)
    // Ctrl + mouse wheel zooms the page.
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !(e.target as HTMLElement).closest?.('.content')) return
      e.preventDefault()
      const z = getSettings().pageZoom || 1
      updateSettings({ pageZoom: Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + (e.deltaY < 0 ? 0.1 : -0.1))) * 100) / 100 })
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
    }
  }, [])

  // Automatic backups (Settings ▸ General ▸ Backups).
  useEffect(() => startAutoBackup((msg) => setToast(msg)), [])

  // Unsaved edits are written before the window closes.
  useEffect(() => api.onBeforeClose(flushAllSaves), [])

  // ----- what's open -----
  const openNotebookName = selectedKey ? refOf(selectedKey).notebook : null
  const notebook = tree?.notebooks.find((n) => n.name === openNotebookName) ?? null
  const selectedKind = selectedKey ? kindOf(selectedKey) : null
  const sectionKey = selectedKey && selectedKind !== 'notebook' ? (selectedKind === 'page' ? parentOf(selectedKey) : selectedKey) : null
  const section = sectionKey ? notebook?.sections.find((s) => s.name === nameOf(sectionKey)) ?? null : null
  const pages: PageRow[] = useMemo(
    () => (section && sectionKey ? section.pages.map((p) => ({ key: `${sectionKey}/${p.name}`, name: p.name, path: p.path, hasCanvas: p.hasCanvas, level: p.level ?? 0 })) : []),
    [section, sectionKey]
  )

  // Every section keeps its own tab color (saved in the notebook folder), so dragging a
  // tab doesn't change it. Sections without one get one here: existing notebooks keep
  // the colors they had by position, new sections get a color no other section uses.
  const coloring = useRef(false)
  useEffect(() => {
    if (!notebook || coloring.current || notebook.sections.every((s) => s.color)) return
    coloring.current = true
    const fresh = notebook.sections.every((s) => !s.color)
    const used = notebook.sections.map((s) => s.color)
    void (async () => {
      for (const [i, s] of notebook.sections.entries()) {
        if (s.color) continue
        const color = fresh ? SECTION_COLORS[i % SECTION_COLORS.length].value : nextSectionColor(used)
        used[i] = color
        await api.setSectionColor(notebook.name, s.name, color)
      }
      await refresh()
      coloring.current = false
    })()
  }, [notebook, refresh])

  // Opening a page that's inside a folded page (e.g. with Ctrl+P) unfolds it. (Folding the
  // page you're in afterwards is fine: only a newly opened page unfolds things.)
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  useEffect(() => {
    const list = pagesRef.current
    const i = list.findIndex((p) => p.key === selectedKey)
    if (i < 0) return
    const parents = ancestorsOf(list, i)
    setFolded((f) => (parents.some((k) => f.has(k)) ? new Set([...f].filter((k) => !parents.includes(k))) : f))
  }, [selectedKey, section])

  /** Toast for a failed result; returns true if it succeeded. */
  const check = <T,>(r: Result<T>): r is { ok: true; data: T } => {
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

  /** Types the name of a new subpage of `pageKey` into the sidebar. */
  const startSubpage = (pageKey: string) => {
    setSidebarVisible(true)
    setEditing({ mode: 'create', parentKey: parentOf(pageKey)!, kind: 'page', error: null, under: pageKey })
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
    setRecent((prev) => prev.map((k) => remapKey(k, from, to)))
    setFavorites((prev) => prev.map((k) => remapKey(k, from, to)))
    setFolded((prev) => new Set([...prev].map((k) => remapKey(k, from, to))))
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
    // A new subpage goes just below its page's subpages, one level under it.
    if (editing.mode === 'create' && editing.under && sectionKey === editing.parentKey) {
      const name = nameOf(key)
      const i = pages.findIndex((p) => p.key === editing.under)
      if (i >= 0) {
        const end = blockEnd(pages, i)
        const order = pages.map((p) => p.name)
        order.splice(end, 0, name)
        const levels = Object.fromEntries(pages.map((p) => [p.name, p.level]))
        levels[name] = Math.min(2, pages[i].level + 1)
        const { notebook: nb, section: sec } = refOf(editing.parentKey!)
        await api.setOrder(nb, sec!, order)
        await api.setPageLevels(nb, sec!, levels)
        setFolded((f) => new Set([...f].filter((k) => k !== editing.under)))
      }
    }
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

  // ----- delete (to the recycle bin, with Undo) -----
  const restore = async (id: string) => {
    const r = await api.restoreFromTrash(id)
    if (!check(r)) return
    const t = await refresh()
    const ref = r.data
    const key = [ref.notebook, ref.section, ref.page].filter(Boolean).join('/')
    if (t) setSelectedKey(landing(t, key))
    setInfoState(null)
  }

  const remove = async (key: string) => {
    await flushAllSaves()
    const { notebook: nb, section: sec, page } = refOf(key)
    const kind = kindOf(key)
    const afterDelete = async (id: string) => {
      const t = await refresh()
      // Move to a neighbour of what was deleted (another page / section), or close the notebook.
      setSelectedKey((k) => {
        if (!k || !isWithin(k, key)) return k
        const parent = parentOf(key)
        return parent && t ? landing(t, parent) : null
      })
      setFavorites((f) => f.filter((k) => !isWithin(k, key)))
      setInfo(`Moved ${kind} "${nameOf(key)}" to the Recycle bin`, { label: 'Undo', run: () => void restore(id) })
    }

    if (kind === 'page') {
      // Its subpages stay where they are, moved up a level (they don't join the page above).
      const i = sectionKey === parentOf(key) ? pages.findIndex((p) => p.key === key) : -1
      if (i >= 0 && blockEnd(pages, i) > i + 1) {
        const levels = Object.fromEntries(pages.map((p) => [p.name, p.level]))
        for (let k = i + 1; k < blockEnd(pages, i); k++) levels[pages[k].name] = Math.max(0, pages[k].level - 1)
        await api.setPageLevels(nb, sec!, levels)
      }
      const r = await api.deletePage(nb, sec!, page!)
      if (check(r)) await afterDelete(r.data)
      return
    }
    const del = (force: boolean) => (kind === 'notebook' ? api.deleteNotebook(nb, { force }) : api.deleteSection(nb, sec!, { force }))
    const r = await del(false)
    if (r.ok) return afterDelete(r.data)
    if (r.error.code !== 'NOT_EMPTY') return void check(r)
    setConfirm({
      title: `Delete ${kind} "${nameOf(key)}"?`,
      message: `It contains ${describeContents(r.error.contents)}. It will go to the Recycle bin (File → Recycle bin), where it's kept for 30 days.`,
      confirmLabel: `Delete ${kind}`,
      onConfirm: async () => {
        const d = await del(true)
        if (check(d)) await afterDelete(d.data)
      }
    })
  }

  // ----- new page from a template, duplicate, history, reordering -----
  const createFromTemplate = async (secKey: string, name: string, content: string): Promise<EngineError | null> => {
    const { notebook: nb, section: sec } = refOf(secKey)
    const r = await api.createPage(nb, sec!, name, content)
    if (!r.ok) return r.error
    setTemplateFor(null)
    await refresh()
    setSelectedKey(`${secKey}/${r.data.name}`)
    return null
  }

  const duplicate = async (key: string) => {
    await flushAllSaves()
    const { notebook: nb, section: sec, page } = refOf(key)
    const r = await api.duplicatePage(nb, sec!, page!)
    if (!check(r)) return
    await refresh()
    setSelectedKey(`${nb}/${sec}/${r.data}`)
    setInfo(`Made a copy: "${r.data}"`)
  }

  const reorder = async (secKey: string | null, names: string[]) => {
    if (!notebook) return
    const r = await api.setOrder(notebook.name, secKey ? refOf(secKey).section! : null, names)
    if (check(r)) await refresh()
  }

  const toggleFavorite = (key: string) => setFavorites((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]))

  /** Opens any page by key (from Recent / Favorites), switching notebook if needed. */
  const openPage = (key: string) => {
    if (tree && existsIn(tree, key)) setSelectedKey(key)
    else {
      setRecent((r) => r.filter((k) => k !== key))
      setFavorites((f) => f.filter((k) => k !== key))
      setToast('That page no longer exists.')
    }
  }

  // ----- whiteboard → page: add a picture of the whiteboard to the end of the page -----
  const snapshotToPage = async () => {
    const board = getActivePage().board
    if (!board || !selectedKey || selectedKind !== 'page') return
    const { notebook: nb, section: sec, page } = refOf(selectedKey)
    const blob = await board.snapshot()
    if (!blob) return setToast('The whiteboard is empty.')
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
    const saved = await api.saveAsset(nb, sec!, `whiteboard-${stamp}.png`, new Uint8Array(await blob.arrayBuffer()))
    if (!check(saved)) return
    const r = await api.appendToPage(nb, sec!, page!, `![Whiteboard](${saved.data})`)
    if (check(r)) setInfo('Added a picture of the whiteboard to the end of the page', { label: 'Show page', run: () => setMode('page') })
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

  // ----- the page title was edited: rename the page to match (the editor stays open) -----
  // keyAlias keeps the editor's React key the same across that rename, so it isn't reloaded.
  const [keyAlias, setKeyAlias] = useState<Record<string, string>>({})
  const renameFromTitle = async (key: string, title: string): Promise<boolean> => {
    await flushAllSaves()
    const { notebook: nb, section: sec, page } = refOf(key)
    const r = await api.renamePage(nb, sec!, page!, title)
    if (!r.ok) {
      if (r.error.code === 'DUPLICATE') setInfo(`The title wasn't used as the page name: another page here is already called "${title}".`)
      return false
    }
    const newKey = `${nb}/${sec}/${r.data}`
    setKeyAlias((a) => ({ [newKey]: a[key] ?? key }))
    remapAll(key, newKey)
    await refresh()
    return true
  }

  const showInFolder = async (key: string) => void check(await api.showInFolder(refOf(key)))
  const openRootFolder = async () => void check(await api.openRootFolder())

  /** Makes a page a subpage of the page above (+1) or moves it back out (-1). */
  const shiftLevel = async (key: string, delta: 1 | -1) => {
    const levels = shiftLevels(pages, nameOf(key), delta)
    if (!levels) {
      const i = pages.findIndex((p) => p.key === key)
      return setInfo(
        delta < 0 ? 'This is already a normal page.' : i === 0 ? 'The first page can’t be a subpage: there’s no page above it.' : 'A subpage can only go one level under the page above it (two levels at most).'
      )
    }
    const { notebook: nb, section: sec } = refOf(key)
    const r = await api.setPageLevels(nb, sec!, levels)
    if (!check(r)) return
    // Show it: unfold the page it now belongs under.
    const i = pages.findIndex((p) => p.key === key)
    const parents = ancestorsOf(pages.map((p) => ({ ...p, level: levels[p.name] ?? 0 })), i)
    if (parents.length) setFolded((f) => new Set([...f].filter((k) => !parents.includes(k))))
    await refresh()
  }
  const toggleFold = (key: string) =>
    setFolded((f) => {
      const n = new Set(f)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const sidebarActions: SidebarActions = {
    select: setSelectedKey,
    startCreate,
    startRename,
    submitEdit: (v, b) => void submitEdit(v, b),
    cancelEdit: () => setEditing(null),
    remove: (k) => void remove(k),
    openMenu: (x, y, key) => setMenu({ x, y, key }),
    reorder: (names) => void reorder(sectionKey, names),
    shiftLevel: (k, d) => void shiftLevel(k, d),
    toggleFold
  }

  const menuItems = (key: string | null): (MenuItem | MenuSwatches | 'sep')[] => {
    if (key === null) return [{ label: 'Open notebook…', onClick: () => setNotebookDialog({ mode: 'open' }) }]
    const kind = kindOf(key)
    if (kind === 'notebook') {
      return [
        { label: 'New section', onClick: () => startCreate(key) },
        { label: 'Rename notebook…', onClick: () => startRename(key) },
        { label: 'Back up notebook…', onClick: () => void backup(key) },
        { label: 'Show in file manager', onClick: () => void showInFolder(key) },
        'sep',
        { label: 'Delete notebook', danger: true, onClick: () => void remove(key) }
      ]
    }
    const secKey = kind === 'section' ? key : parentOf(key)!
    const items: (MenuItem | MenuSwatches | 'sep')[] = [
      { label: 'New page', shortcut: 'Ctrl+N', onClick: () => startCreate(secKey) },
      { label: 'New page from template…', onClick: () => setTemplateFor(secKey) }
    ]
    if (kind === 'section') {
      const { notebook: nbName, section: secName } = refOf(key)
      const current = tree?.notebooks.find((n) => n.name === nbName)?.sections.find((x) => x.name === secName)?.color
      items.push({ label: 'New section', onClick: () => startCreate(parentOf(key)) }, 'sep', { label: 'Rename', shortcut: 'F2', onClick: () => startRename(key) }, 'sep', {
        label: 'Section color',
        swatches: SECTION_COLORS,
        current,
        onPick: (c) => void api.setSectionColor(nbName, secName!, c).then((r) => void (check(r) && refresh()))
      })
    } else {
      items.push(
        'sep',
        { label: 'Rename', shortcut: 'F2', onClick: () => startRename(key) },
        { label: 'New subpage', onClick: () => startSubpage(key) },
        ...((): MenuItem[] => {
          const p = pages.find((x) => x.key === key)
          if (!p) return []
          const out: MenuItem[] = []
          if (shiftLevels(pages, p.name, 1)) out.push({ label: 'Make subpage', shortcut: 'Alt+→', onClick: () => void shiftLevel(key, 1) })
          if (p.level > 0) out.push({ label: p.level > 1 ? 'Move out a level' : 'Make a normal page', shortcut: 'Alt+←', onClick: () => void shiftLevel(key, -1) })
          return out
        })(),
        { label: 'Duplicate', onClick: () => void duplicate(key) },
        { label: 'Move…', onClick: () => setMoving(key) },
        { label: 'Page history…', onClick: () => setHistoryFor(key) },
        { label: favorites.includes(key) ? 'Remove from Favorites' : 'Add to Favorites', onClick: () => toggleFavorite(key) }
      )
    }
    items.push({ label: 'Show in file manager', onClick: () => void showInFolder(key) }, 'sep', {
      label: kind === 'section' ? 'Delete section' : 'Delete page',
      shortcut: kind === 'page' ? 'Del' : undefined,
      danger: true,
      onClick: () => void remove(key)
    })
    return items
  }

  const backup = async (nbName: string) => {
    await flushAllSaves()
    const r = await api.exportNotebook(nbName)
    if (check(r) && r.data) setInfo(`Backed up "${nbName}" to ${r.data}`)
  }
  const restoreBackup = async () => {
    const r = await api.importNotebook(getSettings().backupFolder || (await api.defaultBackupFolder().then((d) => (d.ok ? d.data : ''))))
    if (!check(r) || !r.data) return
    const t = await refresh()
    if (t) setSelectedKey(landing(t, r.data))
    setInfo(`Added notebook "${r.data}" from the backup`)
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
        onRevealNotebook={() => notebook && void showInFolder(notebook.name)}
        onOpenSettings={() => setSettingsOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
        onBackup={() => notebook && void backup(notebook.name)}
        onRestoreBackup={() => void restoreBackup()}
        onTrash={() => setTrashOpen(true)}
        onHistory={() => selectedKind === 'page' && selectedKey && setHistoryFor(selectedKey)}
        onTemplate={() => sectionKey && setTemplateFor(sectionKey)}
        onSnapshot={() => void snapshotToPage()}
        sidebarVisible={sidebarVisible}
        toggleSidebar={() => setSidebarVisible((v) => !v)}
        theme={theme}
        setTheme={setTheme}
        openRootFolder={() => void openRootFolder()}
        revealPage={() => selectedKey && void showInFolder(selectedKey)}
        recent={tree ? recent.filter((k) => existsIn(tree, k) && k !== selectedKey) : []}
        favorites={tree ? favorites.filter((k) => existsIn(tree, k)) : []}
        isFavorite={!!selectedKey && favorites.includes(selectedKey)}
        toggleFavorite={() => selectedKind === 'page' && selectedKey && toggleFavorite(selectedKey)}
        openPage={openPage}
        onQuickOpen={() => setQuickOpen(true)}
        onUpdates={() => setUpdatesOpen(true)}
        onAbout={() => setAboutOpen(true)}
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
        reorder={(names) => void reorder(null, names)}
        dropPage={(pageKey, secKey) => {
          const { notebook: nb, section: sec } = refOf(secKey)
          void movePage(pageKey, nb, sec!).then((err) => err && setToast(err.message))
        }}
      />
      <div className={`layout${sidebarVisible && notebook ? '' : ' no-sidebar'}`} style={{ '--sidebar-width': `${width}px` } as React.CSSProperties}>
        {sidebarVisible && notebook && (
          <>
            <Sidebar sectionKey={sectionKey} sectionName={section?.name ?? null} pages={pages} selectedKey={selectedKey} editing={editing} actions={sidebarActions} folded={folded} />
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
          viewKey={selectedKey ? (keyAlias[selectedKey] ?? selectedKey) : null}
          onTitleChange={(title) => (selectedKey && selectedKind === 'page' ? renameFromTitle(selectedKey, title) : Promise.resolve(false))}
        />
      </div>

      <StatusBar mode={mode} hasPage={selectedKind === 'page'} />

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
          onReorder={(names) => void api.setNotebookOrder(names).then((r) => void (check(r) && refresh()))}
          onClose={() => setNotebookDialog(null)}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {moving && tree && (
        <MoveDialog tree={tree} pageKey={moving} onMove={(nb, sec) => movePage(moving, nb, sec)} onClose={() => setMoving(null)} />
      )}
      {templateFor && <TemplateDialog sectionName={nameOf(templateFor)} onCreate={(name, content) => createFromTemplate(templateFor, name, content)} onClose={() => setTemplateFor(null)} />}
      {trashOpen && (
        <TrashDialog
          notify={setToast}
          onClose={() => setTrashOpen(false)}
          onRestored={async (ref) => {
            const t = await refresh()
            const key = [ref.notebook, ref.section, ref.page].filter(Boolean).join('/')
            if (t) setSelectedKey(landing(t, key))
          }}
        />
      )}
      {historyFor && (
        <HistoryDialog
          notebook={refOf(historyFor).notebook}
          section={refOf(historyFor).section!}
          page={refOf(historyFor).page!}
          beforeRestore={flushAllSaves}
          notify={setToast}
          onClose={() => setHistoryFor(null)}
        />
      )}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {updatesOpen && <UpdateDialog onClose={() => setUpdatesOpen(false)} />}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} onUpdates={() => setUpdatesOpen(true)} />}
      {quickOpen && tree && (
        <QuickOpen
          tree={tree}
          recent={recent.filter((k) => k !== selectedKey)}
          open={(key) => (kindOf(key) === 'page' ? openPage(key) : selectSection(key))}
          onClose={() => setQuickOpen(false)}
        />
      )}
      {info && !toast && (
        <div className="toast info" role="status">
          <span>{info.text}</span>
          {info.action && (
            <button
              className="toast-action"
              onClick={() => {
                info.action!.run()
                setInfoState(null)
              }}
            >
              {info.action.label}
            </button>
          )}
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setInfoState(null)}>
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
