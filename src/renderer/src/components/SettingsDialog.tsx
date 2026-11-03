// Settings window (File ▸ Settings, the ⚙ in the title bar, or Ctrl+,).

import React, { useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, updateSettings, useSettings } from '../lib/settings'
import { COMMON_TYPOS } from '../proofing/typos'

const TABS = ['General', 'Proofing', 'AutoCorrect', 'Dictionary'] as const
type Tab = (typeof TABS)[number]

interface Props {
  theme: 'dark' | 'light'
  setTheme(theme: 'dark' | 'light'): void
  onClose(): void
}

function Check({ label, hint, checked, onChange, disabled = false }: { label: string; hint?: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <label className={`set-check${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="set-label">{label}</span>
        {hint && <span className="set-hint">{hint}</span>}
      </span>
    </label>
  )
}

export function SettingsDialog({ theme, setTheme, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('General')
  const s = useSettings()
  const [fonts, setFonts] = useState<string[]>([])
  const [root, setRoot] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [newWord, setNewWord] = useState('')
  const [filter, setFilter] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => dialogRef.current?.focus(), []) // so Esc works straight away

  useEffect(() => {
    void window.wiki.listFonts().then((r) => r.ok && setFonts(r.data))
    void window.wiki.getRoot().then((r) => r.ok && setRoot(r.data))
  }, [])

  const addReplacement = () => {
    const f = from.trim()
    const t = to.trim()
    if (!f || !t || /\s/.test(f)) return
    updateSettings({ replacements: [...s.replacements.filter((r) => r.from !== f), { from: f, to: t }] })
    setFrom('')
    setTo('')
  }
  const addWord = () => {
    const w = newWord.trim()
    if (!w || /\s/.test(w) || s.dictionary.includes(w)) return
    updateSettings({ dictionary: [...s.dictionary, w].sort((a, b) => a.localeCompare(b)) })
    setNewWord('')
  }

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div ref={dialogRef} tabIndex={-1} className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="settings-head">
          <h2>Settings</h2>
          <button className="icon-btn" aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-tabs" role="tablist" aria-orientation="vertical">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>

          <div className="settings-panel" role="tabpanel" aria-label={tab}>
            {tab === 'General' && (
              <>
                <h3>Appearance</h3>
                <div className="set-row">
                  <span className="set-label">Theme</span>
                  <div className="segmented">
                    <button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')}>
                      Dark
                    </button>
                    <button className={theme === 'light' ? 'selected' : ''} onClick={() => setTheme('light')}>
                      Light
                    </button>
                  </div>
                </div>
                <div className="set-row">
                  <span className="set-label">Page font</span>
                  <select className="dialog-input" value={s.editorFont} onChange={(e) => updateSettings({ editorFont: e.target.value })}>
                    <option value="">Standard (system font)</option>
                    <option value="serif">Serif</option>
                    <option value="monospace">Monospace</option>
                    {fonts.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="set-row">
                  <span className="set-label">Page text size</span>
                  <select className="dialog-input" value={s.editorFontSize} onChange={(e) => updateSettings({ editorFontSize: Number(e.target.value) })}>
                    {[13, 14, 15, 16, 17, 18, 20, 22].map((n) => (
                      <option key={n} value={n}>
                        {n}px{n === DEFAULT_SETTINGS.editorFontSize ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <Check label="Show word and character count" hint="In the status bar at the bottom of the window (words and characters)." checked={s.wordCount} onChange={(v) => updateSettings({ wordCount: v })} />

                <h3>Saving</h3>
                <div className="set-row">
                  <span className="set-label">Save pages</span>
                  <select className="dialog-input" value={s.autosaveDelay} onChange={(e) => updateSettings({ autosaveDelay: Number(e.target.value) })}>
                    <option value={300}>Almost instantly (0.3 s after typing stops)</option>
                    <option value={600}>Quickly (0.6 s, default)</option>
                    <option value={2000}>After a pause (2 s)</option>
                  </select>
                </div>
                <p className="set-hint">Pages are also saved when you switch pages, close the app, or press Ctrl+S.</p>

                <h3>Where your notes are</h3>
                <div className="set-path">
                  <code>{root}</code>
                  <button onClick={() => void window.wiki.openRootFolder()}>Open folder</button>
                </div>
              </>
            )}

            {tab === 'Proofing' && (
              <>
                <h3>Spelling</h3>
                <Check
                  label="Check spelling as you type"
                  hint="Misspelled words get a red wavy underline. Right-click one for suggestions. English (US), works offline."
                  checked={s.spellcheck}
                  onChange={(v) => updateSettings({ spellcheck: v })}
                />
                <h3>AutoCorrect</h3>
                <Check
                  label="Correct common typos as you type"
                  hint={`Uses a list of ${Object.keys(COMMON_TYPOS).length} common mistakes (teh → the) plus your own entries in the AutoCorrect tab.`}
                  checked={s.autocorrect}
                  onChange={(v) => updateSettings({ autocorrect: v })}
                />
                <Check
                  label="Also fix words that are one letter off"
                  hint="Only when exactly one word fits (definitly → definitely). Anything less certain is left underlined, with suggestions on right-click."
                  checked={s.fixNearMisses}
                  disabled={!s.autocorrect}
                  onChange={(v) => updateSettings({ fixNearMisses: v })}
                />
                <Check label="Capitalise the first letter of sentences" checked={s.capitalizeSentences} onChange={(v) => updateSettings({ capitalizeSentences: v })} />
                <h3>AutoFormat as you type</h3>
                <Check label="Replace symbols" hint="(c) → ©   (tm) → ™   -- → –   -> → →   ... → …   1/2 → ½   != → ≠" checked={s.autoformat} onChange={(v) => updateSettings({ autoformat: v })} />
                <Check label={'Use “smart” quotes'} hint={'"straight" → “curly”, and don\'t → don’t'} checked={s.smartQuotes} onChange={(v) => updateSettings({ smartQuotes: v })} />
                <p className="set-note">
                  Changed something you didn't want changed? Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> straight away to put back exactly what you typed.
                </p>
              </>
            )}

            {tab === 'AutoCorrect' && (
              <>
                <h3>Your replacements</h3>
                <p className="set-hint">When you type the word on the left followed by a space or punctuation, it's replaced with the text on the right. Handy for shortcuts too (e.g. "addr" → your address).</p>
                <form
                  className="set-add"
                  onSubmit={(e) => {
                    e.preventDefault()
                    addReplacement()
                  }}
                >
                  <input className="dialog-input" placeholder="Replace (one word)" value={from} onChange={(e) => setFrom(e.target.value)} />
                  <span className="arrow">→</span>
                  <input className="dialog-input" placeholder="With" value={to} onChange={(e) => setTo(e.target.value)} />
                  <button type="submit" className="primary" disabled={!from.trim() || !to.trim() || /\s/.test(from.trim())}>
                    Add
                  </button>
                </form>
                {s.replacements.length === 0 ? (
                  <p className="set-empty">No replacements of your own yet.</p>
                ) : (
                  <ul className="set-list">
                    {s.replacements.map((r) => (
                      <li key={r.from}>
                        <code>{r.from}</code>
                        <span className="arrow">→</span>
                        <span className="grow">{r.to}</span>
                        <button className="icon-btn" aria-label={`Remove ${r.from}`} onClick={() => updateSettings({ replacements: s.replacements.filter((x) => x.from !== r.from) })}>
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <h3>Built-in typo list</h3>
                <input className="dialog-input" placeholder="Search the built-in list…" value={filter} onChange={(e) => setFilter(e.target.value.toLowerCase())} />
                <ul className="set-list compact">
                  {Object.entries(COMMON_TYPOS)
                    .filter(([k, v]) => !filter || k.includes(filter) || v.toLowerCase().includes(filter))
                    .slice(0, 60)
                    .map(([k, v]) => (
                      <li key={k}>
                        <code>{k}</code>
                        <span className="arrow">→</span>
                        <span className="grow">{v}</span>
                      </li>
                    ))}
                </ul>
              </>
            )}

            {tab === 'Dictionary' && (
              <>
                <h3>Your dictionary</h3>
                <p className="set-hint">Words here are never marked as misspelled (names, places, jargon). Right-click an underlined word and choose "Add to dictionary" to add it from a page.</p>
                <form
                  className="set-add"
                  onSubmit={(e) => {
                    e.preventDefault()
                    addWord()
                  }}
                >
                  <input className="dialog-input" placeholder="Add a word" value={newWord} onChange={(e) => setNewWord(e.target.value)} />
                  <button type="submit" className="primary" disabled={!newWord.trim() || /\s/.test(newWord.trim())}>
                    Add
                  </button>
                </form>
                {s.dictionary.length === 0 ? (
                  <p className="set-empty">No words added yet.</p>
                ) : (
                  <ul className="set-list">
                    {s.dictionary.map((w) => (
                      <li key={w}>
                        <span className="grow">{w}</span>
                        <button className="icon-btn" aria-label={`Remove ${w}`} onClick={() => updateSettings({ dictionary: s.dictionary.filter((x) => x !== w) })}>
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
