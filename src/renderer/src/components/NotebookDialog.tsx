// File ▸ Open notebook / New notebook / Rename notebook.

import React, { useEffect, useRef, useState } from 'react'
import type { EngineError, Tree } from '../../../shared/types'
import { NotebookIcon } from './Icons'
import { moveInList } from './Sidebar'

export type NotebookDialogMode = { mode: 'open' } | { mode: 'new' } | { mode: 'rename'; notebook: string }

interface Props {
  state: NotebookDialogMode
  tree: Tree
  openNotebook: string | null
  onOpen(name: string): void
  /** Returns an error to show, or null on success (the dialog then closes). */
  onCreate(name: string): Promise<EngineError | null>
  onRename(oldName: string, newName: string): Promise<EngineError | null>
  setMode(state: NotebookDialogMode): void
  /** New order of the notebooks (names). */
  onReorder(names: string[]): void
  onClose(): void
}

export function NotebookDialog({ state, tree, openNotebook, onOpen, onCreate, onRename, setMode, onReorder, onClose }: Props) {
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="dialog notebook-dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        {state.mode === 'open' ? (
          <OpenList tree={tree} openNotebook={openNotebook} onOpen={onOpen} onNew={() => setMode({ mode: 'new' })} onReorder={onReorder} onClose={onClose} />
        ) : (
          <NameForm
            title={state.mode === 'new' ? 'New notebook' : `Rename notebook "${state.notebook}"`}
            initial={state.mode === 'rename' ? state.notebook : ''}
            submitLabel={state.mode === 'new' ? 'Create' : 'Rename'}
            onSubmit={(name) => (state.mode === 'new' ? onCreate(name) : onRename(state.notebook, name))}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  )
}

function OpenList({ tree, openNotebook, onOpen, onNew, onReorder, onClose }: { tree: Tree; openNotebook: string | null; onOpen(n: string): void; onNew(): void; onReorder(names: string[]): void; onClose(): void }) {
  const dragging = useRef<string | null>(null)
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined)
  const names = tree.notebooks.map((n) => n.name)
  const move = (name: string, dir: -1 | 1) => {
    const i = names.indexOf(name)
    const j = i + dir
    if (j < 0 || j >= names.length) return
    const order = [...names]
    order.splice(i, 1)
    order.splice(j, 0, name)
    onReorder(order)
  }
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>('.selected, button')?.focus()
  }, [])

  return (
    <>
      <h2>Open notebook</h2>
      {tree.notebooks.length === 0 ? (
        <p>There are no notebooks yet.</p>
      ) : (
        <div
          className="notebook-list"
          ref={listRef}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
            e.preventDefault()
            // Alt+↑ / Alt+↓ moves the focused notebook in the list.
            const focused = (document.activeElement as HTMLElement | null)?.dataset.name
            if (e.altKey && focused) return move(focused, e.key === 'ArrowUp' ? -1 : 1)
            const items = [...(listRef.current?.querySelectorAll('button') ?? [])]
            const i = items.indexOf(document.activeElement as HTMLButtonElement)
            items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
          }}
        >
          {tree.notebooks.map((nb) => {
            const pages = nb.sections.reduce((n, s) => n + s.pages.length, 0)
            return (
              <button
                key={nb.name}
                data-name={nb.name}
                className={`notebook-item${nb.name === openNotebook ? ' selected' : ''}`}
                onClick={() => onOpen(nb.name)}
                draggable
                onDragStart={(e) => {
                  dragging.current = nb.name
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', nb.name)
                }}
                onDragEnd={() => {
                  dragging.current = null
                  setDropBefore(undefined)
                }}
                onDragOver={(e) => {
                  if (!dragging.current) return
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  const i = names.indexOf(nb.name)
                  setDropBefore(e.clientY < r.top + r.height / 2 ? nb.name : (names[i + 1] ?? null))
                }}
                onDrop={(e) => {
                  if (!dragging.current) return
                  e.preventDefault()
                  const order = moveInList(names, dragging.current, dropBefore ?? null)
                  setDropBefore(undefined)
                  if (order.join('/') !== names.join('/')) onReorder(order)
                }}
                data-drop={dropBefore === nb.name ? 'before' : dropBefore === null && nb.name === names[names.length - 1] ? 'after' : undefined}
                title="Drag (or Alt+↑ / Alt+↓) to change the order"
              >
                <NotebookIcon />
                <span className="nb-name">{nb.name}</span>
                <span className="nb-meta">
                  {nb.sections.length} section{nb.sections.length === 1 ? '' : 's'} · {pages} page{pages === 1 ? '' : 's'}
                  {nb.name === openNotebook && ' · open'}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <div className="actions">
        <button onClick={onNew}>New notebook…</button>
        <span style={{ flex: 1 }} />
        <button onClick={onClose}>Cancel</button>
      </div>
    </>
  )
}

function NameForm({ title, initial, submitLabel, onSubmit, onCancel }: { title: string; initial: string; submitLabel: string; onSubmit(name: string): Promise<EngineError | null>; onCancel(): void }) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const err = await onSubmit(value)
        setBusy(false)
        if (err) setError(err.message)
      }}
    >
      <h2>{title}</h2>
      <input
        className="dialog-input"
        autoFocus
        value={value}
        placeholder="Notebook name"
        aria-invalid={!!error}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
      />
      {error && <p className="dialog-error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy || !value.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
