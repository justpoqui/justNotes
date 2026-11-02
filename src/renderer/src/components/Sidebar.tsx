// The left sidebar: a collapsible Notebook → Section → Page tree.
// Rendered as a flat list of rows (indented by depth) so keyboard navigation
// can simply walk the visible rows in order.

import React, { useEffect, useRef } from 'react'
import type { Tree } from '../../../shared/types'
import { kindOf, type Kind, type Row } from '../lib/tree'
import { Chevron, Dots, NotebookIcon, PageIcon, Plus, SectionIcon } from './Icons'
import { InlineInput } from './InlineInput'

export type Editing =
  | { mode: 'rename'; key: string; error: string | null }
  | { mode: 'create'; parentKey: string | null; kind: Kind; error: string | null }

export interface SidebarActions {
  toggle(key: string, open?: boolean): void
  select(key: string): void
  startCreate(parentKey: string | null): void
  startRename(key: string): void
  submitEdit(value: string, viaBlur: boolean): void
  cancelEdit(): void
  remove(key: string): void
  openMenu(x: number, y: number, key: string | null): void
  openRootFolder(): void
}

interface Props {
  tree: Tree | null
  rows: Row[]
  expanded: Set<string>
  selectedKey: string | null
  editing: Editing | null
  actions: SidebarActions
}

const KIND_ICON = { notebook: NotebookIcon, section: SectionIcon, page: PageIcon }
const CHILD_KIND: Record<'notebook' | 'section', string> = { notebook: 'section', section: 'page' }

export function Sidebar({ tree, rows, expanded, selectedKey, editing, actions }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  // Keep keyboard focus on the selected row when selection moves, and return
  // focus to the tree after an inline edit closes.
  useEffect(() => {
    const list = listRef.current
    if (!list || editing || !selectedKey) return
    const active = document.activeElement
    if (active && active !== document.body && !list.contains(active)) return
    list.querySelector<HTMLElement>(`[data-key="${CSS.escape(selectedKey)}"]`)?.focus({ preventScroll: false })
  }, [selectedKey, editing])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing || rows.length === 0) return
    const i = rows.findIndex((r) => r.key === selectedKey)
    const row = rows[i]
    const go = (j: number) => {
      const target = rows[Math.max(0, Math.min(rows.length - 1, j))]
      if (target) actions.select(target.key)
    }
    const handled = () => e.preventDefault()

    switch (e.key) {
      case 'ArrowDown':
        handled()
        return go(i < 0 ? 0 : i + 1)
      case 'ArrowUp':
        handled()
        return go(i < 0 ? 0 : i - 1)
      case 'Home':
        handled()
        return go(0)
      case 'End':
        handled()
        return go(rows.length - 1)
      case 'ArrowRight':
        handled()
        if (!row || row.kind === 'page') return
        if (!expanded.has(row.key)) return actions.toggle(row.key, true)
        if (rows[i + 1]?.parentKey === row.key) return go(i + 1)
        return
      case 'ArrowLeft':
        handled()
        if (!row) return
        if (row.kind !== 'page' && expanded.has(row.key)) return actions.toggle(row.key, false)
        if (row.parentKey) return actions.select(row.parentKey)
        return
      case 'Enter':
        handled()
        if (row && row.kind !== 'page') actions.toggle(row.key)
        return
      case 'F2':
        handled()
        if (row) actions.startRename(row.key)
        return
      case 'Delete':
        handled()
        if (row) actions.remove(row.key)
        return
      case 'ContextMenu': {
        handled()
        const el = listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(row?.key ?? '')}"]`)
        const r = el?.getBoundingClientRect()
        actions.openMenu(r ? r.left + 24 : 40, r ? r.bottom : 80, row?.key ?? null)
        return
      }
    }
  }

  const createRow = (parentKey: string | null, depth: number) =>
    editing?.mode === 'create' && editing.parentKey === parentKey ? (
      <div className="row editing" style={{ '--depth': depth } as React.CSSProperties} key={`__new__${parentKey}`}>
        <span className="chevron-space" />
        <span className="icon">{React.createElement(KIND_ICON[editing.kind])}</span>
        <InlineInput
          initial=""
          placeholder={`New ${editing.kind} name`}
          error={editing.error}
          onSubmit={actions.submitEdit}
          onCancel={actions.cancelEdit}
        />
      </div>
    ) : null

  const focusable = selectedKey && rows.some((r) => r.key === selectedKey) ? selectedKey : rows[0]?.key

  return (
    <nav className="sidebar" aria-label="Notebooks">
      <div className="sidebar-header">
        <span className="sidebar-title">Notebooks</span>
        <button className="icon-btn" title="New notebook" aria-label="New notebook" onClick={() => actions.startCreate(null)}>
          <Plus />
        </button>
      </div>

      <div
        ref={listRef}
        className="tree"
        role="tree"
        aria-label="Notebooks, sections and pages"
        onKeyDown={onKeyDown}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault()
            actions.openMenu(e.clientX, e.clientY, null)
          }
        }}
      >
        {createRow(null, 0)}

        {tree && tree.notebooks.length === 0 && !editing && (
          <div className="tree-empty">
            <p>No notebooks yet.</p>
            <button className="primary" onClick={() => actions.startCreate(null)}>
              Create a notebook
            </button>
          </div>
        )}

        {rows.map((row) => {
          const isOpen = expanded.has(row.key)
          const isRenaming = editing?.mode === 'rename' && editing.key === row.key
          const Icon = KIND_ICON[row.kind]
          return (
            <React.Fragment key={row.key}>
              <div
                className={`row ${row.kind}${row.key === selectedKey ? ' selected' : ''}`}
                style={{ '--depth': row.depth } as React.CSSProperties}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={row.kind === 'page' ? undefined : isOpen}
                aria-selected={row.key === selectedKey}
                data-key={row.key}
                tabIndex={row.key === focusable ? 0 : -1}
                title={row.path}
                onClick={() => {
                  actions.select(row.key)
                  if (row.kind !== 'page') actions.toggle(row.key)
                }}
                onDoubleClick={(e) => {
                  // Double-click renames a page (folders already toggle on click).
                  if (row.kind === 'page') {
                    e.preventDefault()
                    actions.startRename(row.key)
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  actions.select(row.key)
                  actions.openMenu(e.clientX, e.clientY, row.key)
                }}
              >
                {row.kind === 'page' ? (
                  <span className="chevron-space" />
                ) : (
                  <span
                    className="chevron-hit"
                    onClick={(e) => {
                      e.stopPropagation()
                      actions.toggle(row.key)
                    }}
                  >
                    <Chevron open={isOpen} />
                  </span>
                )}
                <span className="icon">
                  <Icon />
                </span>

                {isRenaming ? (
                  <InlineInput
                    initial={row.name}
                    placeholder={`${row.kind} name`}
                    error={editing.error}
                    onSubmit={actions.submitEdit}
                    onCancel={actions.cancelEdit}
                  />
                ) : (
                  <>
                    <span className="name">{row.name}</span>
                    {row.kind !== 'page' && !row.hasChildren && <span className="hint">empty</span>}
                    <span className="row-actions">
                      {row.kind !== 'page' && (
                        <button
                          className="icon-btn"
                          tabIndex={-1}
                          title={`New ${CHILD_KIND[row.kind]}`}
                          aria-label={`New ${CHILD_KIND[row.kind]} in ${row.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            actions.startCreate(row.key)
                          }}
                        >
                          <Plus />
                        </button>
                      )}
                      <button
                        className="icon-btn"
                        tabIndex={-1}
                        title="More actions"
                        aria-label={`More actions for ${row.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          actions.select(row.key)
                          const r = e.currentTarget.getBoundingClientRect()
                          actions.openMenu(r.left, r.bottom + 2, row.key)
                        }}
                      >
                        <Dots />
                      </button>
                    </span>
                  </>
                )}
              </div>
              {row.kind !== 'page' && isOpen && createRow(row.key, row.depth + 1)}
            </React.Fragment>
          )
        })}
      </div>

      <button className="sidebar-footer" title="Open the WikiBook folder in the file manager" onClick={actions.openRootFolder}>
        <bdi dir="ltr">{tree?.root ?? '…'}</bdi>
      </button>
    </nav>
  )
}

export const childKindOf = (parentKey: string | null): Kind =>
  parentKey === null ? 'notebook' : kindOf(parentKey) === 'notebook' ? 'section' : 'page'
