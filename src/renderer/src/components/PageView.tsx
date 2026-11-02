// The right-hand pane: the selected page in the block editor, or an
// overview of the selected notebook/section.

import React from 'react'
import type { Tree } from '../../../shared/types'
import { kindOf, refOf } from '../lib/tree'
import { NotebookIcon, PageIcon, SectionIcon } from './Icons'
import { PageEditor } from './PageEditor'

interface Props {
  tree: Tree | null
  selectedKey: string | null
  select(key: string): void
  startCreate(parentKey: string | null): void
  notify(message: string): void
}

export function PageView({ tree, selectedKey, select, startCreate, notify }: Props) {
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
            <p>Select a page in the sidebar.</p>
          )}
        </div>
      </main>
    )
  }

  const ref = refOf(selectedKey)
  const kind = kindOf(selectedKey)
  const crumbs = [
    { key: ref.notebook, label: ref.notebook },
    ...(ref.section ? [{ key: `${ref.notebook}/${ref.section}`, label: ref.section }] : []),
    ...(ref.page ? [{ key: selectedKey, label: ref.page }] : [])
  ]

  return (
    <main className="content">
      <nav className="breadcrumb" aria-label="Location">
        {crumbs.map((c, i) => (
          <React.Fragment key={c.key}>
            {i > 0 && <span className="crumb-sep">›</span>}
            {i < crumbs.length - 1 ? (
              <button className="crumb" onClick={() => select(c.key)}>
                {c.label}
              </button>
            ) : (
              <span className="crumb current">{c.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>

      {kind === 'page' ? (
        <article className="page">
          <PageEditor key={selectedKey} notebook={ref.notebook} section={ref.section!} page={ref.page!} onError={notify} />
        </article>
      ) : (
        <FolderOverview tree={tree} selectedKey={selectedKey} select={select} startCreate={startCreate} />
      )}
    </main>
  )
}

function FolderOverview({ tree, selectedKey, select, startCreate }: Omit<Props, 'notify'> & { selectedKey: string }) {
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
          {nb.sections.length} section{nb.sections.length === 1 ? '' : 's'}
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
