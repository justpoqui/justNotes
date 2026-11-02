// The right-hand pane. Shows the selected page (read-only until the Phase 3
// editor), or an overview of the selected notebook/section.

import React, { useEffect, useState } from 'react'
import type { Tree } from '../../../shared/types'
import { kindOf, refOf } from '../lib/tree'
import { NotebookIcon, PageIcon, SectionIcon } from './Icons'

interface Props {
  tree: Tree | null
  selectedKey: string | null
  select(key: string): void
  startCreate(parentKey: string | null): void
}

export function PageView({ tree, selectedKey, select, startCreate }: Props) {
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
        <PageContent notebook={ref.notebook} section={ref.section!} page={ref.page!} />
      ) : (
        <FolderOverview tree={tree} selectedKey={selectedKey} select={select} startCreate={startCreate} />
      )}
    </main>
  )
}

function PageContent({ notebook, section, page }: { notebook: string; section: string; page: string }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const r = await window.wiki.readPage(notebook, section, page)
      if (!alive) return
      if (r.ok) {
        setText(r.data)
        setError(null)
      } else setError(r.error.message)
    }
    setText(null)
    void load()
    // Reload if the file is edited by another program.
    const off = window.wiki.onChanged(() => void load())
    return () => {
      alive = false
      off()
    }
  }, [notebook, section, page])

  return (
    <article className="page">
      {error ? (
        <p className="error-text">{error}</p>
      ) : text === null ? null : (
        <>
          <pre className="markdown-raw">{text}</pre>
          <p className="phase-note">Read-only preview. The editor arrives in Phase 3.</p>
        </>
      )}
    </article>
  )
}

function FolderOverview({ tree, selectedKey, select, startCreate }: Props & { selectedKey: string }) {
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
