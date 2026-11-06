// Bar under the ribbon: the open notebook's name, then its sections as tabs.

import React, { useRef, useState } from 'react'
import type { NotebookInfo } from '../../../shared/types'
import { NotebookIcon, Plus } from './Icons'
import { InlineInput } from './InlineInput'
import { moveInList, PAGE_DRAG, type Editing } from './Sidebar'

/** Each section gets a colour from this list (by position), like coloured notebook dividers. */
export const SECTION_COLORS = ['#7aa2f7', '#e5a26b', '#9ece6a', '#d887c4', '#5fc4c0', '#e0c46c', '#b39df3', '#f28b82']

interface Props {
  notebook: NotebookInfo | null
  sectionKey: string | null
  editing: Editing | null
  select(sectionKey: string): void
  startCreate(notebookKey: string): void
  startRename(sectionKey: string): void
  submitEdit(value: string, viaBlur: boolean): void
  cancelEdit(): void
  openMenu(x: number, y: number, key: string): void
  openNotebookPicker(): void
  /** New order of the notebook's sections (names). */
  reorder(names: string[]): void
  /** A page was dropped on a section tab: move it there. */
  dropPage(pageKey: string, sectionKey: string): void
}

const SECTION_DRAG = 'application/x-justnotes-section'

export function SectionTabs({ notebook, sectionKey, editing, select, startCreate, startRename, submitEdit, cancelEdit, openMenu, openNotebookPicker, reorder, dropPage }: Props) {
  const dragging = useRef<string | null>(null)
  const [dropAt, setDropAt] = useState<{ key: string; side: 'before' | 'after' | 'into' } | null>(null)
  const creating = notebook && editing?.mode === 'create' && editing.kind === 'section' && editing.parentKey === notebook.name

  return (
    <div className="section-bar">
      <button
        className="notebook-switch"
        onClick={openNotebookPicker}
        onContextMenu={(e) => {
          if (!notebook) return
          e.preventDefault()
          openMenu(e.clientX, e.clientY, notebook.name)
        }}
        title="Open another notebook"
      >
        <NotebookIcon />
        <span className="notebook-label">Notebook:</span>
        <span className="notebook-name">{notebook?.name ?? 'none open'}</span>
        <span className="caret">▾</span>
      </button>

      {notebook && (
        <div className="section-tabs" role="tablist" aria-label={`Sections in ${notebook.name}`}>
          {notebook.sections.map((s, i) => {
            const key = `${notebook.name}/${s.name}`
            const selected = key === sectionKey
            const renaming = editing?.mode === 'rename' && editing.key === key
            return (
              <div
                key={key}
                role="tab"
                tabIndex={selected ? 0 : -1}
                aria-selected={selected}
                className={`section-tab${selected ? ' selected' : ''}`}
                style={{ '--tab-color': SECTION_COLORS[i % SECTION_COLORS.length] } as React.CSSProperties}
                onClick={() => !renaming && select(key)}
                onDoubleClick={() => startRename(key)}
                onKeyDown={(e) => {
                  if (renaming) return
                  if (e.key === 'F2') startRename(key)
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    const list = notebook.sections
                    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length
                    select(`${notebook.name}/${list[j].name}`)
                    ;(e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus()
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  select(key)
                  openMenu(e.clientX, e.clientY, key)
                }}
                draggable={!renaming}
                onDragStart={(e) => {
                  dragging.current = s.name
                  e.dataTransfer.setData(SECTION_DRAG, s.name)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  dragging.current = null
                  setDropAt(null)
                }}
                onDragOver={(e) => {
                  const isPage = e.dataTransfer.types.includes(PAGE_DRAG)
                  if (!isPage && !dragging.current) return
                  e.preventDefault()
                  if (isPage) return setDropAt({ key, side: 'into' })
                  const r = e.currentTarget.getBoundingClientRect()
                  setDropAt({ key, side: e.clientX < r.left + r.width / 2 ? 'before' : 'after' })
                }}
                onDragLeave={() => setDropAt((d) => (d?.key === key ? null : d))}
                onDrop={(e) => {
                  e.preventDefault()
                  const page = e.dataTransfer.getData(PAGE_DRAG)
                  const at = dropAt
                  setDropAt(null)
                  if (page) {
                    if (!page.startsWith(key + '/')) dropPage(page, key)
                    return
                  }
                  if (!dragging.current || !at) return
                  const list = notebook.sections.map((x) => x.name)
                  const before = at.side === 'before' ? s.name : (list[list.indexOf(s.name) + 1] ?? null)
                  const order = moveInList(list, dragging.current, before === dragging.current ? (list[list.indexOf(s.name) + 2] ?? null) : before)
                  if (order.join('/') !== list.join('/')) reorder(order)
                }}
                data-drop={dropAt?.key === key ? dropAt.side : undefined}
                title={`${s.name} · ${s.pages.length} page${s.pages.length === 1 ? '' : 's'} (double-click to rename, drag to reorder, drop a page here to move it)`}
              >
                {renaming ? (
                  <InlineInput initial={s.name} placeholder="section name" error={editing.error} onSubmit={submitEdit} onCancel={cancelEdit} />
                ) : (
                  s.name
                )}
              </div>
            )
          })}
          {creating && (
            <div className="section-tab selected" style={{ '--tab-color': SECTION_COLORS[notebook.sections.length % SECTION_COLORS.length] } as React.CSSProperties}>
              <InlineInput initial="" placeholder="New section" error={editing.error} onSubmit={submitEdit} onCancel={cancelEdit} />
            </div>
          )}
          <button className="section-add" title="New section" aria-label="New section" onClick={() => startCreate(notebook.name)}>
            <Plus />
          </button>
        </div>
      )}
    </div>
  )
}
