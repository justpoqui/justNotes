// The right-hand pane: the selected page in the block editor, or an
// overview of the selected notebook/section.

import React, { useState } from 'react'
import type { Tree } from '../../../shared/types'
import { kindOf, refOf } from '../lib/tree'
import { NotebookIcon, PageIcon, SectionIcon } from './Icons'
import { useSettings } from '../lib/settings'
import { PageEditor } from './PageEditor'
import type { PageMode } from './Ribbon'
import { BoardMode, PageMode as PageModeIcon } from './RibbonIcons'
import { Whiteboard } from './Whiteboard'

interface Props {
  tree: Tree | null
  selectedKey: string | null
  select(key: string): void
  startCreate(parentKey: string | null): void
  notify(message: string): void
  mode: PageMode
  setMode(mode: PageMode): void
  theme: 'dark' | 'light'
  onOpenNotebook(): void
  /** Same as selectedKey, except right after a page was renamed from its title (so the open editor stays). */
  viewKey: string | null
  onTitleChange(title: string): Promise<boolean>
}

export function PageView({ tree, selectedKey, select, startCreate, notify, mode, setMode, theme, onOpenNotebook, viewKey, onTitleChange }: Props) {
  const pageZoom = useSettings().pageZoom || 1
  // Where the editor / whiteboard show their "Saved" indicator.
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null)

  if (!tree) return <main className="content" />

  if (!selectedKey) {
    return (
      <main className="content">
        <div className="placeholder">
          {tree.notebooks.length === 0 ? (
            <>
              <h2>Welcome to justNotes</h2>
              <p>Your notes are plain Markdown files in <code>{tree.root}</code>.</p>
              <button className="primary" onClick={() => startCreate(null)}>
                Create your first notebook
              </button>
            </>
          ) : (
            <>
              <h2>No notebook open</h2>
              <p>
                You have {tree.notebooks.length} notebook{tree.notebooks.length === 1 ? '' : 's'}.
              </p>
              <div className="placeholder-actions">
                <button className="primary" onClick={onOpenNotebook}>
                  Open notebook
                </button>
                <button onClick={() => startCreate(null)}>New notebook</button>
              </div>
            </>
          )}
        </div>
      </main>
    )
  }

  const ref = refOf(selectedKey)
  const kind = kindOf(selectedKey)
  const isPage = kind === 'page'
  const boardMode = isPage && mode === 'board'

  return (
    <main className={`content${boardMode ? ' board-mode' : ''}`}>
      {/* (Where you are shows in the notebook button, the section tab and the page list.) */}
      {isPage && (
        <div className="page-bar">
          <div className="status-slot" ref={setStatusSlot} />
          <div className="mode-switch" role="tablist" aria-label="Page view">
            <button role="tab" aria-selected={!boardMode} className={!boardMode ? 'selected' : ''} onClick={() => setMode('page')} title="Write on the page">
              <PageModeIcon /> Page
            </button>
            <button role="tab" aria-selected={boardMode} className={boardMode ? 'selected' : ''} onClick={() => setMode('board')} title="Draw on this page's whiteboard">
              <BoardMode /> Whiteboard
            </button>
          </div>
        </div>
      )}

      {isPage ? (
        boardMode ? (
          <Whiteboard key={viewKey ?? selectedKey} notebook={ref.notebook} section={ref.section!} page={ref.page!} theme={theme} onError={notify} statusSlot={statusSlot} />
        ) : (
          <article className="page" style={{ zoom: pageZoom }}>
            <PageEditor key={viewKey ?? selectedKey} notebook={ref.notebook} section={ref.section!} page={ref.page!} onError={notify} statusSlot={statusSlot} onTitleChange={onTitleChange} />
          </article>
        )
      ) : (
        <FolderOverview tree={tree} selectedKey={selectedKey} select={select} startCreate={startCreate} />
      )}
    </main>
  )
}

function FolderOverview({ tree, selectedKey, select, startCreate }: Pick<Props, 'tree' | 'select' | 'startCreate'> & { selectedKey: string }) {
  const ref = refOf(selectedKey)
  const nb = tree!.notebooks.find((n) => n.name === ref.notebook)
  if (!nb) return null

  if (!ref.section) {
    return (
      <section className="overview">
        <h1>
          <NotebookIcon /> {nb.name}
        </h1>
        <p className="muted">
          {nb.sections.length === 0
            ? 'This notebook has no sections yet. Sections are the colored tabs above; each one holds pages.'
            : `${nb.sections.length} section${nb.sections.length === 1 ? '' : 's'}`}
        </p>
        <div className="cards">
          {nb.sections.map((s) => (
            <button key={s.name} className="card" onClick={() => select(`${nb.name}/${s.name}`)}>
              <SectionIcon />
              <span className="card-name">{s.name}</span>
              <span className="muted">
                {s.pages.length} page{s.pages.length === 1 ? '' : 's'}
              </span>
            </button>
          ))}
          <button className="card add" onClick={() => startCreate(nb.name)}>
            + New section
          </button>
        </div>
      </section>
    )
  }

  const sec = nb.sections.find((s) => s.name === ref.section)
  if (!sec) return null
  return (
    <section className="overview">
      <h1>
        <SectionIcon /> {sec.name}
      </h1>
      <p className="muted">
        {sec.pages.length} page{sec.pages.length === 1 ? '' : 's'}
      </p>
      <div className="cards">
        {sec.pages.map((p) => (
          <button key={p.name} className="card" onClick={() => select(`${nb.name}/${sec.name}/${p.name}`)}>
            <PageIcon />
            <span className="card-name">{p.name}</span>
          </button>
        ))}
        <button className="card add" onClick={() => startCreate(`${nb.name}/${sec.name}`)}>
          + New page
        </button>
      </div>
    </section>
  )
}
