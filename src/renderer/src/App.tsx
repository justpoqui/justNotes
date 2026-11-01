// Phase 1 test harness: buttons to create / rename / delete notebooks, sections
// and pages, plus a plain list of what is on disk. Not the real sidebar (Phase 2).

import React, { useCallback, useEffect, useState } from 'react'
import type { EngineError, Result, Tree } from '../../shared/types'

type Dialog =
  | {
      type: 'prompt'
      title: string
      initial: string
      submitLabel: string
      /** Returns an error to show in the dialog, or null to close it. */
      onSubmit: (value: string) => Promise<EngineError | null>
    }
  | { type: 'confirm'; title: string; message: string; confirmLabel: string; onConfirm: () => Promise<void> }

const api = window.wiki

function describeContents(c: EngineError['contents']): string {
  if (!c) return ''
  const parts: string[] = []
  if (c.sections) parts.push(`${c.sections} section${c.sections === 1 ? '' : 's'}`)
  if (c.pages) parts.push(`${c.pages} page${c.pages === 1 ? '' : 's'}`)
  if (c.otherFiles) parts.push(`${c.otherFiles} other file${c.otherFiles === 1 ? '' : 's'}`)
  return parts.join(', ')
}

export function App(): React.JSX.Element {
  const [tree, setTree] = useState<Tree | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)

  const refresh = useCallback(async () => {
    const r = await api.listTree()
    if (r.ok) setTree(r.data)
    else setError(r.error.message)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Opens a name prompt; on success refreshes the list, on failure keeps the dialog open with the error. */
  const askName = (title: string, submitLabel: string, initial: string, run: (name: string) => Promise<Result<unknown>>) =>
    setDialog({
      type: 'prompt',
      title,
      initial,
      submitLabel,
      onSubmit: async (value) => {
        const r = await run(value)
        await refresh()
        return r.ok ? null : r.error
      }
    })

  /**
   * Deletes something. If the engine says the folder isn't empty, asks for
   * confirmation (listing what's inside) and retries with force.
   */
  const remove = async (label: string, run: (force: boolean) => Promise<Result<void>>, alwaysConfirm = false) => {
    setError(null)
    const doForce = async () => {
      const r = await run(true)
      if (!r.ok) setError(r.error.message)
      await refresh()
    }
    if (alwaysConfirm) {
      setDialog({
        type: 'confirm',
        title: `Delete ${label}?`,
        message: 'The file will be permanently removed from disk.',
        confirmLabel: 'Delete',
        onConfirm: doForce
      })
      return
    }
    const r = await run(false)
    if (r.ok) return refresh()
    if (r.error.code === 'NOT_EMPTY') {
      setDialog({
        type: 'confirm',
        title: `Delete ${label}?`,
        message: `It still contains ${describeContents(r.error.contents)}. Everything inside will be permanently deleted from disk.`,
        confirmLabel: 'Delete everything',
        onConfirm: doForce
      })
    } else {
      setError(r.error.message)
      await refresh()
    }
  }

  return (
    <div className="app">
      <header>
        <h1>justNotes · Phase 1 file engine</h1>
        <div className="root">
          Folder: <code>{tree?.root ?? '…'}</code>
          <button onClick={() => void api.openRootFolder()}>Open in file manager</button>
          <button onClick={() => void refresh()}>Refresh</button>
        </div>
      </header>

      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="toolbar">
        <button className="primary" onClick={() => askName('New notebook', 'Create', '', (n) => api.createNotebook(n))}>
          + Notebook
        </button>
      </div>

      {tree && tree.notebooks.length === 0 && <p className="empty">No notebooks yet. Create one to start.</p>}

      <ul className="tree">
        {tree?.notebooks.map((nb) => (
          <li key={nb.name}>
            <div className="row notebook">
              <span className="label">📓 {nb.name}</span>
              <button onClick={() => askName(`New section in "${nb.name}"`, 'Create', '', (n) => api.createSection(nb.name, n))}>
                + Section
              </button>
              <button onClick={() => askName(`Rename notebook "${nb.name}"`, 'Rename', nb.name, (n) => api.renameNotebook(nb.name, n))}>
                Rename
              </button>
              <button className="danger" onClick={() => void remove(`notebook "${nb.name}"`, (force) => api.deleteNotebook(nb.name, { force }))}>
                Delete
              </button>
            </div>
            <ul>
              {nb.sections.length === 0 && <li className="empty">no sections</li>}
              {nb.sections.map((sec) => (
                <li key={sec.name}>
                  <div className="row section">
                    <span className="label">📁 {sec.name}</span>
                    <button
                      onClick={() =>
                        askName(`New page in "${nb.name} / ${sec.name}"`, 'Create', '', (n) => api.createPage(nb.name, sec.name, n))
                      }
                    >
                      + Page
                    </button>
                    <button
                      onClick={() =>
                        askName(`Rename section "${sec.name}"`, 'Rename', sec.name, (n) => api.renameSection(nb.name, sec.name, n))
                      }
                    >
                      Rename
                    </button>
                    <button
                      className="danger"
                      onClick={() => void remove(`section "${sec.name}"`, (force) => api.deleteSection(nb.name, sec.name, { force }))}
                    >
                      Delete
                    </button>
                  </div>
                  <ul>
                    {sec.pages.length === 0 && <li className="empty">no pages</li>}
                    {sec.pages.map((pg) => (
                      <li key={pg.name}>
                        <div className="row page">
                          <span className="label" title={pg.path}>
                            📄 {pg.name}.md{pg.hasCanvas && ' (+ whiteboard)'}
                          </span>
                          <button
                            onClick={() =>
                              askName(`Rename page "${pg.name}"`, 'Rename', pg.name, (n) =>
                                api.renamePage(nb.name, sec.name, pg.name, n)
                              )
                            }
                          >
                            Rename
                          </button>
                          <button
                            className="danger"
                            onClick={() => void remove(`page "${pg.name}"`, () => api.deletePage(nb.name, sec.name, pg.name), true)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {dialog && <DialogView dialog={dialog} close={() => setDialog(null)} />}
    </div>
  )
}

function DialogView({ dialog, close }: { dialog: Dialog; close: () => void }): React.JSX.Element {
  const [value, setValue] = useState(dialog.type === 'prompt' ? dialog.initial : '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      if (dialog.type === 'prompt') {
        const e = await dialog.onSubmit(value)
        if (e) setErr(e.message)
        else close()
      } else {
        await dialog.onConfirm()
        close()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={close}>
      <form
        className="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2>{dialog.title}</h2>
        {dialog.type === 'prompt' ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setErr(null)
            }}
            onFocus={(e) => e.target.select()}
            placeholder="Name"
          />
        ) : (
          <p>{dialog.message}</p>
        )}
        {err && <p className="dialog-error">{err}</p>}
        <div className="actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            autoFocus={dialog.type === 'confirm'}
            className={dialog.type === 'confirm' ? 'danger' : 'primary'}
            disabled={busy}
          >
            {dialog.type === 'prompt' ? dialog.submitLabel : dialog.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
