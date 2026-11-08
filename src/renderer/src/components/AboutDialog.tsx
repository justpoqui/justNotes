// File ▸ About: version, copyright and license, and the third-party software justNotes includes.

import React, { useEffect, useRef, useState } from 'react'
import logo from '../assets/logo.png'

export function AboutDialog({ onClose, onUpdates }: { onClose(): void; onUpdates(): void }) {
  const [legal, setLegal] = useState<{ license: string; notices: string; version: string } | null>(null)
  const [view, setView] = useState<'about' | 'license' | 'notices'>('about')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    void window.wiki.getLegal().then((r) => r.ok && setLegal(r.data))
  }, [])

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div ref={ref} tabIndex={-1} className={`dialog about-dialog${view === 'about' ? '' : ' wide'}`} role="dialog" aria-modal="true" aria-label="About justNotes" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && (view === 'about' ? onClose() : setView('about'))}>
        <div className="dlg-head">
          <h2>{view === 'about' ? 'About justNotes' : view === 'license' ? 'justNotes license' : 'Third-party software'}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {view === 'about' ? (
          <>
            <div className="about-top">
              <img src={logo} alt="" width={56} height={56} />
              <div>
                <div className="about-name">justNotes</div>
                <div className="muted">Version {legal?.version ?? ''}</div>
              </div>
            </div>
            <p className="about-copy">
              Copyright © 2026 justpoqui. All rights reserved.
              <br />
              Created by justpoqui, the original author of justNotes.
            </p>
            <p className="muted small">
              You may use the official releases for free. The source code is published to be read, not copied: see the license for details. Your notes always belong to you.
            </p>
            <p className="muted small">justNotes is built with open-source software, fonts and dictionaries made by others, each under its own license.</p>
            <div className="actions">
              <button onClick={() => setView('license')}>License</button>
              <button onClick={() => setView('notices')}>Third-party software</button>
              <span style={{ flex: 1 }} />
              <button
                onClick={() => {
                  onClose()
                  onUpdates()
                }}
              >
                Check for updates
              </button>
              <button className="primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <pre className="legal-text" tabIndex={0}>
              {(view === 'license' ? legal?.license : legal?.notices) || 'Loading…'}
            </pre>
            <div className="actions">
              <button onClick={() => setView('about')}>Back</button>
              <span style={{ flex: 1 }} />
              <button className="primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
