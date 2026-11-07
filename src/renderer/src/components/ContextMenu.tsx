import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  shortcut?: string
}

/** A row of color swatches inside a menu (e.g. a section's tab color). */
export interface MenuSwatches {
  label: string
  swatches: { name: string; value: string }[]
  current?: string
  onPick(value: string): void
}

type Entry = MenuItem | MenuSwatches | 'sep'
const isSwatches = (e: Entry): e is MenuSwatches => typeof e === 'object' && 'swatches' in e

/** A small right-click style menu. Closes on outside click, Escape, blur or scroll. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: Entry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: Math.min(x, window.innerWidth - r.width - 4), y: Math.min(y, window.innerHeight - r.height - 4) })
    el.querySelector<HTMLButtonElement>('button')?.focus()
  }, [x, y])

  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    document.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      document.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = [...(ref.current?.querySelectorAll('button') ?? [])]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
  }

  return (
    <div ref={ref} className="menu" role="menu" style={{ left: pos.x, top: pos.y }} onKeyDown={onKeyDown}>
      {items.map((item, i) =>
        item === 'sep' ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : isSwatches(item) ? (
          <div key={i} className="menu-swatches" role="group" aria-label={item.label}>
            <span className="menu-swatches-label">{item.label}</span>
            <div className="menu-swatch-row">
              {item.swatches.map((c) => (
                <button
                  key={c.value}
                  role="menuitemradio"
                  aria-checked={item.current === c.value}
                  aria-label={c.name}
                  title={c.name}
                  className={`menu-swatch${item.current === c.value ? ' selected' : ''}`}
                  style={{ background: c.value }}
                  onClick={() => {
                    onClose()
                    item.onPick(c.value)
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <button
            key={i}
            role="menuitem"
            className={item.danger ? 'danger' : undefined}
            onClick={() => {
              onClose()
              item.onClick()
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        )
      )}
    </div>
  )
}
