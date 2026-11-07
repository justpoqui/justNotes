// Smaller dialogs: new page from template, recycle bin, page history, keyboard shortcuts.

import React, { useEffect, useRef, useState } from 'react'
import type { EngineError, PageVersion, TrashItem } from '../../../shared/types'
import { fillTemplate, TEMPLATES } from '../lib/templates'
import { NotebookIcon, PageIcon, SectionIcon } from './Icons'

/** Shared frame: backdrop, title, close on Esc / outside click, focus inside. */
function Frame({ title, className = '', onClose, children }: { title: string; className?: string; onClose(): void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus()
  }, [])
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        className={`dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="dlg-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const when = (iso: string) => {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 24 * 60 && d.getDate() === new Date().getDate()) return `today ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------- templates

export function TemplateDialog({ sectionName, onCreate, onClose }: { sectionName: string; onCreate(name: string, content: string): Promise<EngineError | null>; onClose(): void }) {
  const [templateId, setTemplateId] = useState('meeting')
  const t = TEMPLATES.find((x) => x.id === templateId)!
  const [name, setName] = useState(t.defaultName?.() ?? '')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Frame title={`New page in "${sectionName}"`} className="template-dialog" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          const err = await onCreate(name, fillTemplate(t, name.trim()))
          setBusy(false)
          if (err) setError(err.message)
        }}
      >
        <div className="template-grid" role="radiogroup" aria-label="Template">
          {TEMPLATES.map((x) => (
            <button
              type="button"
              role="radio"
              aria-checked={x.id === templateId}
              key={x.id}
              className={`template-card${x.id === templateId ? ' selected' : ''}`}
              onClick={() => {
                setTemplateId(x.id)
                if (!touched) setName(x.defaultName?.() ?? '')
              }}
            >
              <span className="tc-name">{x.name}</span>
              <span className="tc-desc">{x.description}</span>
            </button>
          ))}
        </div>
        <label className="move-field">
          <span>Page name</span>
          <input
            className="dialog-input"
            autoFocus
            value={name}
            placeholder="Page name"
            aria-invalid={!!error}
            onChange={(e) => {
              setName(e.target.value)
              setTouched(true)
              setError(null)
            }}
          />
        </label>
        {error && <p className="dialog-error">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            Create page
          </button>
        </div>
      </form>
    </Frame>
  )
}

// ---------------------------------------------------------------- recycle bin

export function TrashDialog({ onRestored, notify, onClose }: { onRestored(ref: { notebook: string; section?: string; page?: string }): void; notify(msg: string): void; onClose(): void }) {
  const [items, setItems] = useState<TrashItem[] | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const load = async () => {
    const r = await window.wiki.listTrash()
    if (r.ok) setItems(r.data)
    else notify(r.error.message)
  }
  useEffect(() => {
    void load()
  }, [])
  const label = (t: TrashItem) => (t.kind === 'page' ? t.page : t.kind === 'section' ? t.section : t.notebook)
  const where = (t: TrashItem) => (t.kind === 'page' ? `${t.notebook} › ${t.section}` : t.kind === 'section' ? t.notebook : 'Notebook')
  const Icon = { notebook: NotebookIcon, section: SectionIcon, page: PageIcon }

  return (
    <Frame title="Recycle bin" className="list-dialog" onClose={onClose}>
      <p className="muted small">Deleted notebooks, sections and pages are kept here for 30 days.</p>
      {items === null ? null : items.length === 0 ? (
        <p className="set-empty">The recycle bin is empty.</p>
      ) : (
        <ul className="bin-list">
          {items.map((t) => {
            const I = Icon[t.kind]
            return (
              <li key={t.id}>
                <span className="bin-icon">
                  <I />
                </span>
                <span className="bin-main">
                  <span className="bin-name">{label(t)}</span>
                  <span className="muted small">
                    {where(t)}
                    {t.kind !== 'page' && ` · ${t.pages} page${t.pages === 1 ? '' : 's'}`} · deleted {when(t.deletedAt)}
                  </span>
                </span>
                <button
                  onClick={async () => {
                    const r = await window.wiki.restoreFromTrash(t.id)
                    if (!r.ok) return notify(r.error.message)
                    onRestored(r.data)
                    void load()
                  }}
                >
                  Restore
                </button>
                <button
                  className="icon-btn"
                  title="Delete for good"
                  aria-label={`Delete ${label(t)} for good`}
                  onClick={async () => {
                    const r = await window.wiki.emptyTrash(t.id)
                    if (!r.ok) notify(r.error.message)
                    void load()
                  }}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="actions">
        {items && items.length > 0 && (
          <button
            className={confirmEmpty ? 'danger-fill' : ''}
            onClick={async () => {
              if (!confirmEmpty) return setConfirmEmpty(true)
              const r = await window.wiki.emptyTrash()
              if (!r.ok) notify(r.error.message)
              setConfirmEmpty(false)
              void load()
            }}
          >
            {confirmEmpty ? 'Really delete everything for good?' : 'Empty recycle bin'}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Frame>
  )
}

// ---------------------------------------------------------------- page history

export function HistoryDialog({ notebook, section, page, beforeRestore, notify, onClose }: { notebook: string; section: string; page: string; beforeRestore(): Promise<void>; notify(msg: string): void; onClose(): void }) {
  const [versions, setVersions] = useState<PageVersion[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const reload = () =>
    window.wiki.listVersions(notebook, section, page).then((r) => {
      if (!r.ok) return notify(r.error.message)
      setVersions(r.data)
      if (r.data[0]) setSelected(r.data[0].id)
    })
  useEffect(() => {
    void reload()
  }, [notebook, section, page])
  const saveNow = async () => {
    await beforeRestore() // the version should include what was just typed
    const r = await window.wiki.saveVersion(notebook, section, page)
    if (!r.ok) return notify(r.error.message)
    if (!r.data) return notify('The page is empty, so there is nothing to keep yet.')
    setSaved(true)
    await reload()
  }
  useEffect(() => {
    if (!selected) return setText('')
    void window.wiki.readVersion(notebook, section, page, selected).then((r) => setText(r.ok ? r.data : r.error.message))
  }, [selected])

  return (
    <Frame title={`History of "${page}"`} className="history-dialog" onClose={onClose}>
      {versions === null ? null : versions.length === 0 ? (
        <p className="set-empty">No earlier versions yet. While you edit, a copy of the page is kept every 10 minutes (the last 50 are kept), or use "Save a version now".</p>
      ) : (
        <div className="history-body">
          <ul className="history-list" role="listbox" aria-label="Versions">
            {versions.map((v) => (
              <li key={v.id}>
                <button role="option" aria-selected={v.id === selected} className={v.id === selected ? 'selected' : ''} onClick={() => setSelected(v.id)}>
                  <span className="bin-name">{when(v.savedAt)}</span>
                  <span className="muted small">{v.preview || '(empty)'}</span>
                </button>
              </li>
            ))}
          </ul>
          <pre className="history-preview" aria-label="Preview">
            {text}
          </pre>
        </div>
      )}
      <div className="actions">
        <button onClick={() => void saveNow()} title="Keep a copy of the page as it is right now">
          {saved ? 'Saved ✓' : 'Save a version now'}
        </button>
        <span className="muted small" style={{ flex: 1 }}>
          Restoring keeps the current text in the history too, so nothing is lost.
        </span>
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          disabled={!selected || !versions?.length}
          onClick={async () => {
            await beforeRestore()
            const r = await window.wiki.restoreVersion(notebook, section, page, selected!)
            if (!r.ok) return notify(r.error.message)
            onClose()
          }}
        >
          Restore this version
        </button>
      </div>
    </Frame>
  )
}

// ---------------------------------------------------------------- keyboard shortcuts

const SHORTCUTS: [string, [string, string][]][] = [
  ['Pages & sections', [['Ctrl+P', 'Go to a page or section by name'], ['Ctrl+N', 'New page'], ['Alt+↑ / Alt+↓ (in File › Open)', 'Move a notebook up / down'], ['Ctrl+Shift+N', 'New section'], ['Ctrl+Page Down / Up', 'Next / previous page'], ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous section'], ['F2', 'Rename the selected page'], ['Delete', 'Delete the selected page (in the page list)'], ['Alt+↑ / Alt+↓', 'Move the selected page (and its subpages) up / down'], ['Alt+→ / Alt+←', 'Make the selected page a subpage / a normal page again'], ['→ / ←', 'Show / hide a page’s subpages (in the page list)']]],
  ['Writing', [['Ctrl+B / I / U', 'Bold / italic / underline'], ['Ctrl+Shift+S', 'Strikethrough'], ['Ctrl+E', 'Inline code'], ['Ctrl+Shift+H', 'Highlight'], ['Ctrl+Shift+L / E / R / J', 'Align left / center / right / justify'], ['/', 'Block menu (headings, lists, tables…)'], ['Alt+Shift+D / Alt+Shift+T', "Insert today's date / the time"], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo (Ctrl+Z right after an automatic correction undoes just that)']]],
  ['Find & view', [['Ctrl+F', 'Find in page'], ['Ctrl+H', 'Find and replace'], ['Ctrl+= / Ctrl+− / Ctrl+0', 'Zoom the page in / out / 100%'], ['Ctrl+mouse wheel', 'Zoom the page']]],
  ['App', [['Ctrl+S', 'Save now (pages also save by themselves)'], ['Ctrl+,', 'Settings'], ['F1 or Ctrl+/', 'This list']]]
]

export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  return (
    <Frame title="Keyboard shortcuts" className="shortcuts-dialog" onClose={onClose}>
      <div className="shortcut-cols">
        {SHORTCUTS.map(([group, rows]) => (
          <section key={group}>
            <h3>{group}</h3>
            <table>
              <tbody>
                {rows.map(([k, what]) => (
                  <tr key={k}>
                    <td>
                      {k.split(' / ').map((part, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && ' / '}
                          <kbd>{part}</kbd>
                        </React.Fragment>
                      ))}
                    </td>
                    <td>{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Frame>
  )
}
