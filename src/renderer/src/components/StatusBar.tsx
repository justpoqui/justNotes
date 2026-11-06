// Bar along the bottom of the window: word & character counts, undo / redo, page zoom.

import type { Editor } from '@tiptap/react'
import React, { useEffect, useState } from 'react'
import { useActivePage } from '../editor/activePage'
import { updateSettings, useSettings } from '../lib/settings'
import type { PageMode } from './Ribbon'
import * as Ic from './RibbonIcons'

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

/** Re-render when the editor changes, so undo/redo enable correctly. */
function useEditorTick(editor: Editor | null) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!editor) return
    const bump = () => setTick((t) => t + 1)
    editor.on('transaction', bump)
    return () => {
      editor.off('transaction', bump)
    }
  }, [editor])
}

export function StatusBar({ mode, hasPage }: { mode: PageMode; hasPage: boolean }) {
  const { editor, stats } = useActivePage()
  const settings = useSettings()
  useEditorTick(editor)

  const ed = editor && !editor.isDestroyed && mode === 'page' ? editor : null
  const canRedo = !!ed && ed.isEditable && ed.can().redo()
  const zoom = settings.pageZoom || 1
  const setZoom = (z: number) =>
    updateSettings({
      pageZoom: Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100
    })
  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOM_STEPS.find((s) => s > zoom + 0.001) : [...ZOOM_STEPS].reverse().find((s) => s < zoom - 0.001)
    setZoom(next ?? zoom)
  }
  const n = (x: number) => x.toLocaleString()
  const showCounts = settings.wordCount && hasPage && mode === 'page' && stats

  return (
    <footer className="statusbar" aria-label="Status bar">
      <div className="sb-counts" aria-live="polite">
        {showCounts && (
          <>
            <span title={`${n(stats.words)} words in this page`}>{stats.selWords ? `${n(stats.selWords)} of ${n(stats.words)} words` : `${n(stats.words)} word${stats.words === 1 ? '' : 's'}`}</span>
            <span className="sb-dot">·</span>
            <span title={`${n(stats.charsNoSpaces)} characters without spaces`}>
              {stats.selChars ? `${n(stats.selChars)} of ${n(stats.chars)} characters` : `${n(stats.chars)} character${stats.chars === 1 ? '' : 's'}`}
            </span>
          </>
        )}
        {hasPage && mode === 'board' && <span>Whiteboard · undo, redo and zoom are at the bottom-left of the board</span>}
      </div>

      {mode !== 'board' && (
        <div className="sb-right">
          <button
            className="sb-btn"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            // (enabled for any editable page: Ctrl+Z may also revert an automatic correction)
            disabled={!ed || !ed.isEditable}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => ed && (ed.commands.revertAutoChange() || ed.chain().focus().undo().run())}
          >
            <Ic.Undo />
          </button>
          <button className="sb-btn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onMouseDown={(e) => e.preventDefault()} onClick={() => ed?.chain().focus().redo().run()}>
            <Ic.Redo />
          </button>

          <span className="sb-sep" />

          <div className="sb-zoom" title="Page zoom (only the page; to make the whole app bigger, see Settings ▸ App size)">
            <button className="sb-btn" aria-label="Zoom out" title="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => step(-1)}>
              −
            </button>
            <input
              type="range"
              className="sb-slider"
              aria-label="Page zoom"
              min={ZOOM_MIN * 100}
              max={ZOOM_MAX * 100}
              step={5}
              value={Math.round(zoom * 100)}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
              onDoubleClick={() => setZoom(1)}
            />
            <button className="sb-btn" aria-label="Zoom in" title="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => step(1)}>
              +
            </button>
            <button className="sb-pct" title="Reset to 100%" aria-label={`Zoom ${Math.round(zoom * 100)}%, click to reset`} onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)}%
            </button>
          </div>
        </div>
      )}
    </footer>
  )
}
