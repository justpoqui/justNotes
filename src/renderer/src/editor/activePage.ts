// Tiny store holding whatever is open in the main pane (the page editor or the
// whiteboard) so the ribbon can act on it.

import type { Editor } from '@tiptap/react'
import { useSyncExternalStore } from 'react'

/** The few whiteboard operations the ribbon needs (kept independent of Excalidraw's types). */
export interface BoardControls {
  setTool(tool: 'selection' | 'hand' | 'freedraw' | 'rectangle' | 'ellipse' | 'arrow' | 'text' | 'eraser' | 'image'): void
  activeTool(): string
  undo(): void
  redo(): void
  /** A PNG picture of the whole whiteboard (null when it's empty). */
  snapshot(): Promise<Blob | null>
  /** Called whenever the board's state changes. Returns an unsubscribe function. */
  subscribe(callback: () => void): () => void
}

export interface ActivePage {
  editor: Editor | null
  board: BoardControls | null
  /** Opens a file picker and inserts the chosen image into the page. */
  insertImage: (() => void) | null
  /** Opens the find bar (with the replace row if asked). */
  openFind: ((replace: boolean) => void) | null
  /** Export the open page as PDF. */
  exportPdf: (() => void) | null
  /** Word / character counts of the open page (status bar). */
  stats: { words: number; chars: number; charsNoSpaces: number; selWords: number; selChars: number } | null
}

let current: ActivePage = { editor: null, board: null, insertImage: null, openFind: null, exportPdf: null, stats: null }
const listeners = new Set<() => void>()

export function setActivePage(patch: Partial<ActivePage>): void {
  current = { ...current, ...patch }
  listeners.forEach((l) => l())
}

/** Clears fields only if they still belong to the caller (avoids races when switching pages). */
export function clearActivePage(owner: Partial<ActivePage>): void {
  const next = { ...current }
  let changed = false
  for (const k of Object.keys(owner) as (keyof ActivePage)[]) {
    if (current[k] === owner[k]) {
      ;(next as Record<string, unknown>)[k] = null
      changed = true
    }
  }
  if (changed) {
    current = next
    listeners.forEach((l) => l())
  }
}

export const getActivePage = (): ActivePage => current

export function useActivePage(): ActivePage {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}
