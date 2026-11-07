// Left sidebar: the pages of the selected section (sections are the tabs above,
// the notebook is chosen from File ▸ Open notebook).

import React, { useEffect, useRef, useState } from 'react'
import type { Kind } from '../lib/tree'
import { Dots, PageIcon, Plus } from './Icons'
import { InlineInput } from './InlineInput'
import { BoardMode } from './RibbonIcons'
import { ancestorsOf, hasSubpages, moveBlock, stepBlock, visiblePages } from '../lib/subpages'

export type Editing =
  | { mode: 'rename'; key: string; error: string | null }
  /** `under`: a new page is a subpage of this page (key). */
  | { mode: 'create'; parentKey: string | null; kind: Kind; error: string | null; under?: string }

export interface PageRow {
  key: string
  name: string
  path: string
  hasCanvas: boolean
  /** 0 = page, 1 = subpage, 2 = sub-subpage. */
  level: number
}

export interface SidebarActions {
  select(key: string): void
  startCreate(parentKey: string | null): void
  startRename(key: string): void
  submitEdit(value: string, viaBlur: boolean): void
  cancelEdit(): void
  remove(key: string): void
  openMenu(x: number, y: number, key: string | null): void
  /** New order of the section's pages (names). */
  reorder(names: string[]): void
  /** Makes a page a subpage (+1) or less of one (-1). */
  shiftLevel(key: string, delta: 1 | -1): void
  /** Folds / unfolds a page's subpages. */
  toggleFold(key: string): void
}

/** Drag-and-drop data type for a page (its key), also accepted by the section tabs. */
export const PAGE_DRAG = 'application/x-justnotes-page'

/** `list` with `item` moved to just before `before` (or to the end). */
export function moveInList(list: string[], item: string, before: string | null): string[] {
  const rest = list.filter((x) => x !== item)
  const at = before === null ? rest.length : rest.indexOf(before)
  rest.splice(at < 0 ? rest.length : at, 0, item)
  return rest
}

interface Props {
  /** The section whose pages are listed (null when the notebook has no sections). */
  sectionKey: string | null
  sectionName: string | null
  pages: PageRow[]
  selectedKey: string | null
  editing: Editing | null
  actions: SidebarActions
  /** Pages whose subpages are folded away. */
  folded: Set<string>
}

export function Sidebar({ sectionKey, sectionName, pages, selectedKey, editing, actions, folded }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  // Where a dragged page would land: before this page key (null = at the end).
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined)
  const dragging = useRef<string | null>(null)
  const names = pages.map((p) => p.name)
  const shown = visiblePages(pages, folded)
  // When the open page is folded away, the visible page holding it is marked instead.
  const selIndex = pages.findIndex((p) => p.key === selectedKey)
  const holder = selIndex >= 0 && !shown.some((p) => p.key === selectedKey) ? ancestorsOf(pages, selIndex).find((k) => shown.some((p) => p.key === k)) : undefined

  // Keep keyboard focus on the selected page when moving with the arrow keys,
  // and give it back after an inline rename/create closes.
  useEffect(() => {
    const list = listRef.current
    if (!list || editing || !selectedKey) return
    const active = document.activeElement
    if (active && active !== document.body && !list.contains(active)) return
    list.querySelector<HTMLElement>(`[data-key="${CSS.escape(selectedKey)}"]`)?.focus()
  }, [selectedKey, editing])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing || shown.length === 0) return
    const i = shown.findIndex((p) => p.key === selectedKey)
    const go = (j: number) => actions.select(shown[Math.max(0, Math.min(shown.length - 1, j))].key)
    const current = shown[i]
    // Alt+↑ / Alt+↓ moves the selected page (with its subpages) in the list.
    if (e.altKey && current && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const order = stepBlock(pages, current.name, e.key === 'ArrowUp' ? -1 : 1)
      if (order) actions.reorder(order)
      return
    }
    // Alt+→ / Alt+← makes it a subpage of the page above / moves it back out.
    if (e.altKey && current && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault()
      actions.shiftLevel(current.key, e.key === 'ArrowRight' ? 1 : -1)
      return
    }
    // → / ← unfold / fold a page's subpages (← on a subpage goes to its page).
    if (!e.altKey && current && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const full = pages.findIndex((p) => p.key === current.key)
      const parentOf = () => {
        for (let k = i - 1; k >= 0; k--) if (shown[k].level < current.level) return k
        return -1
      }
      e.preventDefault()
      if (e.key === 'ArrowRight') {
        if (hasSubpages(pages, full) && folded.has(current.key)) actions.toggleFold(current.key)
        else if (hasSubpages(pages, full)) go(i + 1)
      } else if (hasSubpages(pages, full) && !folded.has(current.key)) actions.toggleFold(current.key)
      else if (current.level > 0) go(parentOf())
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        return go(i < 0 ? 0 : i + 1)
      case 'ArrowUp':
        e.preventDefault()
        return go(i < 0 ? 0 : i - 1)
      case 'Home':
        e.preventDefault()
        return go(0)
      case 'End':
        e.preventDefault()
        return go(shown.length - 1)
      case 'F2':
        e.preventDefault()
        if (current) actions.startRename(current.key)
        return
      case 'Delete':
        e.preventDefault()
        if (current) actions.remove(current.key)
        return
      case 'ContextMenu': {
        e.preventDefault()
        const r = listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(current?.key ?? '')}"]`)?.getBoundingClientRect()
        actions.openMenu(r ? r.left + 24 : 40, r ? r.bottom : 80, current?.key ?? sectionKey)
        return
      }
    }
  }

  const creating = editing?.mode === 'create' && editing.kind === 'page' && editing.parentKey === sectionKey
  const newRow = (level: number) =>
    editing?.mode === 'create' ? (
      <div className="row editing page" style={{ '--level': level } as React.CSSProperties}>
        <span className="fold-space" />
        <span className="icon">
          <PageIcon />
        </span>
        <InlineInput initial="" placeholder={level ? 'New subpage name' : 'New page name'} error={editing.error} onSubmit={actions.submitEdit} onCancel={actions.cancelEdit} />
      </div>
    ) : null
  const focusable = selectedKey && pages.some((p) => p.key === selectedKey) ? selectedKey : pages[0]?.key

  return (
    <nav className="sidebar" aria-label="Pages">
      <div className="sidebar-header">
        <span className="sidebar-title" title={sectionName ?? undefined}>
          {sectionName ? `${sectionName} · Pages` : 'Pages'}
        </span>
        {sectionKey && (
          <button className="icon-btn" title="New page" aria-label="New page" onClick={() => actions.startCreate(sectionKey)}>
            <Plus />
          </button>
        )}
      </div>

      <div
        ref={listRef}
        className="tree"
        role="listbox"
        aria-label={sectionName ? `Pages in ${sectionName}` : 'Pages'}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget && sectionKey) {
            e.preventDefault()
            actions.openMenu(e.clientX, e.clientY, sectionKey)
          }
        }}
      >
        {creating && !editing.under && newRow(0)}

        {!sectionKey && <div className="tree-empty">No sections yet.</div>}
        {sectionKey && pages.length === 0 && !creating && (
          <div className="tree-empty">
            <p>No pages in this section yet.</p>
            <button className="primary" onClick={() => actions.startCreate(sectionKey)}>
              New page
            </button>
          </div>
        )}

        {shown.map((p, idx) => {
          const renaming = editing?.mode === 'rename' && editing.key === p.key
          const full = pages.findIndex((x) => x.key === p.key)
          const parent = hasSubpages(pages, full)
          const isFolded = folded.has(p.key)
          // A new subpage is typed in just below its page's own subpages.
          const subRow = creating && editing.under ? (() => {
            const underIdx = shown.findIndex((x) => x.key === editing.under)
            if (underIdx < 0) return idx === shown.length - 1 ? newRow(1) : null
            let last = underIdx
            while (last + 1 < shown.length && shown[last + 1].level > shown[underIdx].level) last++
            return last === idx ? newRow(Math.min(2, shown[underIdx].level + 1)) : null
          })() : null
          return (
            <React.Fragment key={p.key}>
            <div
              className={`row page${p.key === selectedKey ? ' selected' : ''}${p.key === holder ? ' holds-selected' : ''}${p.level ? ' subpage' : ''}`}
              style={{ '--level': p.level } as React.CSSProperties}
              aria-level={p.level + 1}
              aria-expanded={parent ? !isFolded : undefined}
              role="option"
              aria-selected={p.key === selectedKey}
              data-key={p.key}
              tabIndex={p.key === focusable ? 0 : -1}
              title={p.path}
              onClick={() => actions.select(p.key)}
              draggable={!renaming}
              onDragStart={(e) => {
                dragging.current = p.name
                e.dataTransfer.setData(PAGE_DRAG, p.key)
                e.dataTransfer.setData('text/plain', p.name)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => {
                dragging.current = null
                setDropBefore(undefined)
              }}
              onDragOver={(e) => {
                if (!dragging.current) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                setDropBefore(e.clientY < r.top + r.height / 2 ? p.name : (shown[idx + 1]?.name ?? null))
              }}
              onDrop={(e) => {
                if (!dragging.current) return
                e.preventDefault()
                const order = moveBlock(pages, dragging.current, dropBefore ?? null)
                setDropBefore(undefined)
                if (order.join('/') !== names.join('/')) actions.reorder(order)
              }}
              data-drop={dropBefore === p.name ? 'before' : dropBefore === null && p.key === shown[shown.length - 1]?.key ? 'after' : undefined}
              onDoubleClick={(e) => {
                e.preventDefault()
                actions.startRename(p.key)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                actions.select(p.key)
                actions.openMenu(e.clientX, e.clientY, p.key)
              }}
            >
              {parent ? (
                <button
                  className="fold"
                  tabIndex={-1}
                  aria-label={isFolded ? `Show the subpages of ${p.name}` : `Hide the subpages of ${p.name}`}
                  title={isFolded ? 'Show subpages' : 'Hide subpages'}
                  onClick={(e) => {
                    e.stopPropagation()
                    actions.toggleFold(p.key)
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {isFolded ? '▸' : '▾'}
                </button>
              ) : (
                <span className="fold-space" />
              )}
              <span className="icon">
                <PageIcon />
              </span>
              {renaming ? (
                <InlineInput initial={p.name} placeholder="page name" error={editing.error} onSubmit={actions.submitEdit} onCancel={actions.cancelEdit} />
              ) : (
                <>
                  <span className="name">{p.name}</span>
                  {p.hasCanvas && (
                    <span className="badge" title="This page has a whiteboard drawing" aria-label="has a whiteboard">
                      <BoardMode />
                    </span>
                  )}
                  <span className="row-actions">
                    <button
                      className="icon-btn"
                      tabIndex={-1}
                      title="More actions"
                      aria-label={`More actions for ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        actions.select(p.key)
                        const r = e.currentTarget.getBoundingClientRect()
                        actions.openMenu(r.left, r.bottom + 2, p.key)
                      }}
                    >
                      <Dots />
                    </button>
                  </span>
                </>
              )}
            </div>
            {subRow}
            </React.Fragment>
          )
        })}
      </div>
    </nav>
  )
}
