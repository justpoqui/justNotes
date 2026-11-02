import React, { useEffect, useRef } from 'react'

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => confirmRef.current?.focus(), [])

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="alertdialog"
        aria-labelledby="confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2 id="confirm-title">{request.title}</h2>
        <p>{request.message}</p>
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button
            ref={confirmRef}
            className="danger-fill"
            onClick={async () => {
              onClose()
              await request.onConfirm()
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
