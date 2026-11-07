// "Move…" for a page: pick a notebook, then the section to move it into.

import React, { useEffect, useRef, useState } from 'react'
import type { EngineError, Tree } from '../../../shared/types'
import { refOf } from '../lib/tree'
import { SECTION_COLORS } from './SectionTabs'

interface Props {
  tree: Tree
  pageKey: string
  /** Returns an error to show, or null when the move worked (the dialog then closes). */
  onMove(toNotebook: string, toSection: string): Promise<EngineError | null>
  onClose(): void
}

export function MoveDialog({ tree, pageKey, onMove, onClose }: Props) {
  const { notebook, section, page } = refOf(pageKey)
  const [nb, setNb] = useState(notebook)
  const [target, setTarget] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => formRef.current?.focus(), []) // so Esc works straight away
  const sections = tree.notebooks.find((n) => n.name === nb)?.sections ?? []

  const submit = async () => {
    if (!target) return
    setBusy(true)
    const err = await onMove(nb, target)
    setBusy(false)
    if (err) setError(err.message)
  }

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <form
        ref={formRef}
        tabIndex={-1}
        className="dialog move-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2 id="move-title">Move page "{page}"</h2>
        <p className="muted">
          Currently in {notebook} › {section}
        </p>

        {tree.notebooks.length > 1 && (
          <label className="move-field">
            <span>Notebook</span>
            <select
              className="dialog-input"
              value={nb}
              onChange={(e) => {
                setNb(e.target.value)
                setTarget(null)
                setError(null)
              }}
            >
              {tree.notebooks.map((n) => (
                <option key={n.name} value={n.name}>
                  {n.name}
                  {n.name === notebook ? ' (this notebook)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="move-field">
          <span>Section</span>
          {sections.length === 0 ? (
            <p className="muted">This notebook has no sections yet.</p>
          ) : (
            <div className="move-sections" role="radiogroup" aria-label="Section to move to">
              {sections.map((s, i) => {
                const isCurrent = nb === notebook && s.name === section
                return (
                  <button
                    key={s.name}
                    type="button"
                    role="radio"
                    aria-checked={target === s.name}
                    disabled={isCurrent}
                    className={`move-section${target === s.name ? ' selected' : ''}`}
                    style={{ '--tab-color': s.color ?? SECTION_COLORS[i % SECTION_COLORS.length].value } as React.CSSProperties}
                    onClick={() => {
                      setTarget(s.name)
                      setError(null)
                    }}
                    onDoubleClick={() => !isCurrent && void submit()}
                  >
                    <span className="dot" />
                    <span className="move-name">{s.name}</span>
                    <span className="muted">{isCurrent ? 'current' : `${s.pages.length} page${s.pages.length === 1 ? '' : 's'}`}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {error && <p className="dialog-error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!target || busy}>
            Move
          </button>
        </div>
      </form>
    </div>
  )
}
