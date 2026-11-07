// Find & Replace bar shown above the page (Ctrl+F / Ctrl+H).

import type { Editor } from '@tiptap/react'
import React, { useEffect, useRef, useState } from 'react'
import { searchKey } from '../editor/Search'

interface Props {
  editor: Editor
  showReplace: boolean
  setShowReplace(show: boolean): void
  /** Bumped each time Ctrl+F is pressed again, to re-focus the search box. */
  focusToken: number
  onClose(): void
}

export function FindBar({ editor, showReplace, setShowReplace, focusToken, onClose }: Props) {
  // Start with the selected text, if any (single line).
  const [text, setText] = useState(() => {
    const { from, to } = editor.state.selection
    const sel = editor.state.doc.textBetween(from, to, ' ')
    return sel.includes('\n') || sel.length > 80 ? '' : sel
  })
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [, setTick] = useState(0)
  const findRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    findRef.current?.focus()
    findRef.current?.select()
  }, [focusToken])

  useEffect(() => {
    editor.commands.setSearch({ text, caseSensitive, wholeWord })
  }, [editor, text, caseSensitive, wholeWord])

  // Clear highlights when the bar closes; refresh the "x of y" counter on edits.
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    editor.on('transaction', bump)
    return () => {
      editor.off('transaction', bump)
      if (!editor.isDestroyed) editor.commands.clearSearch()
    }
  }, [editor])

  const s = searchKey.getState(editor.state)
  const count = s?.matches.length ?? 0
  const pos = s && s.current >= 0 ? s.current + 1 : 0

  const keys = (e: React.KeyboardEvent, isReplace = false) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (isReplace) editor.commands.replaceCurrent(replacement)
      else editor.commands.findNext(e.shiftKey)
    }
  }

  return (
    <div
      className="find-bar"
      role="search"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
    >
      <div className="find-row">
        <button className="find-toggle" title={showReplace ? 'Hide replace' : 'Show replace (Ctrl+H)'} aria-label="Toggle replace" onClick={() => setShowReplace(!showReplace)}>
          {showReplace ? '▾' : '▸'}
        </button>
        <input ref={findRef} className="find-input" placeholder="Find in page" aria-label="Find" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => keys(e)} />
        <span className={`find-count${text && !count ? ' none' : ''}`}>{text ? (count ? `${pos} of ${count}` : 'No results') : ''}</span>
        <button className={`find-opt${caseSensitive ? ' on' : ''}`} title="Match case" aria-pressed={caseSensitive} onClick={() => setCaseSensitive(!caseSensitive)}>
          Aa
        </button>
        <button className={`find-opt${wholeWord ? ' on' : ''}`} title="Whole words only" aria-pressed={wholeWord} onClick={() => setWholeWord(!wholeWord)}>
          <u>ab</u>
        </button>
        <button className="find-nav" title="Previous (Shift+Enter)" aria-label="Previous match" disabled={!count} onClick={() => editor.commands.findNext(true)}>
          ↑
        </button>
        <button className="find-nav" title="Next (Enter)" aria-label="Next match" disabled={!count} onClick={() => editor.commands.findNext()}>
          ↓
        </button>
        <button className="find-nav" title="Close (Esc)" aria-label="Close find" onClick={onClose}>
          ×
        </button>
      </div>
      {showReplace && (
        <div className="find-row">
          <span className="find-toggle-space" />
          <input className="find-input" placeholder="Replace with" aria-label="Replace with" value={replacement} onChange={(e) => setReplacement(e.target.value)} onKeyDown={(e) => keys(e, true)} />
          <button disabled={!count || !editor.isEditable} onClick={() => editor.commands.replaceCurrent(replacement)}>
            Replace
          </button>
          <button disabled={!count || !editor.isEditable} onClick={() => editor.commands.replaceAll(replacement)}>
            Replace all
          </button>
        </div>
      )}
    </div>
  )
}
