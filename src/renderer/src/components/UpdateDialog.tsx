// The Updates window: what version you have, whether a new one is waiting, and Install.

import React, { useEffect, useRef } from 'react'
import { updateSettings, useSettings } from '../lib/settings'
import { checkNow, installNow, useUpdateState } from '../lib/updates'

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '')

export function UpdateDialog({ onClose }: { onClose(): void }) {
  const u = useUpdateState()
  const settings = useSettings()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const headline = {
    unsupported: 'Updates aren’t available for this copy',
    idle: 'justNotes is up to date as far as we know',
    checking: 'Looking for updates…',
    none: 'You have the latest version',
    downloading: `Downloading version ${u.version ?? ''}… ${u.percent ?? 0}%`,
    ready: `Update pending: version ${u.version}`,
    installing: 'Installing the update…',
    error: 'Couldn’t update'
  }[u.status]

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div ref={ref} tabIndex={-1} className="dialog update-dialog" role="dialog" aria-modal="true" aria-label="Updates" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="dlg-head">
          <h2>Updates</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className={`update-headline ${u.status}`}>{headline}</p>
        <p className="muted small">
          You have version {u.current}
          {u.checkedAt && u.status !== 'checking' ? ` · checked ${when(u.checkedAt)}` : ''}
        </p>
        {u.status === 'downloading' && (
          <div className="update-bar" role="progressbar" aria-valuenow={u.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${u.percent ?? 0}%` }} />
          </div>
        )}
        {(u.status === 'unsupported' || u.status === 'error') && u.message && <p className="update-message">{u.message}</p>}
        {(u.status === 'ready' || u.status === 'downloading') && u.notes && (
          <>
            <h3 className="update-notes-title">What’s new</h3>
            <pre className="update-notes">{u.notes}</pre>
          </>
        )}
        {u.status === 'ready' && (
          <p className="muted small">
            {u.kind === 'deb'
              ? 'Installing asks for your password (it updates the installed app), then justNotes restarts. Your pages are saved first.'
              : u.kind === 'nsis'
                ? 'justNotes saves your pages, installs the new version and restarts. It takes a few seconds.'
                : 'justNotes saves your pages, replaces itself with the new version and restarts.'}
          </p>
        )}
        <label className="set-check">
          <input type="checkbox" checked={settings.checkUpdates} onChange={(e) => updateSettings({ checkUpdates: e.target.checked })} />
          <span>
            <span className="set-label">Check for updates automatically</span>
            <span className="set-hint">At start-up and every few hours. This only contacts GitHub, where justNotes is published.</span>
          </span>
        </label>
        <div className="actions">
          {u.status !== 'unsupported' && (
            <button disabled={u.status === 'checking' || u.status === 'downloading' || u.status === 'installing' || u.status === 'ready'} onClick={() => void checkNow()}>
              Check now
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={onClose}>{u.status === 'ready' ? 'Later' : 'Close'}</button>
          {u.status === 'ready' && (
            <button className="primary" onClick={() => void installNow()}>
              Install and restart
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
