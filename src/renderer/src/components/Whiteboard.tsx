// Per-page whiteboard. Excalidraw is large, so it is only loaded the first
// time a whiteboard is opened.

import React, { lazy, Suspense } from 'react'

const WhiteboardCanvas = lazy(() => import('./WhiteboardCanvas'))

export interface WhiteboardProps {
  notebook: string
  section: string
  page: string
  theme: 'dark' | 'light'
  onError(message: string): void
  statusSlot?: HTMLElement | null
}

export function Whiteboard(props: WhiteboardProps) {
  return (
    <Suspense fallback={<div className="board-loading">Loading whiteboard…</div>}>
      <WhiteboardCanvas {...props} />
    </Suspense>
  )
}
