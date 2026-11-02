import React, { useEffect, useRef, useState } from 'react'

/**
 * Text box used for renaming and creating directly in the tree.
 * Enter submits (and stays open showing the error if it fails), Escape cancels,
 * clicking away submits if something was typed.
 */
export function InlineInput({
  initial,
  placeholder,
  error,
  onSubmit,
  onCancel
}: {
  initial: string
  placeholder: string
  error: string | null
  onSubmit: (value: string, viaBlur: boolean) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <span className="inline-edit">
      <input
        ref={ref}
        value={value}
        placeholder={placeholder}
        aria-invalid={!!error}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            onSubmit(value, false)
          } else if (e.key === 'Escape') {
            done.current = true
            onCancel()
          }
        }}
        onBlur={() => {
          if (done.current) return
          if (value.trim() === '' || value === initial) onCancel()
          else onSubmit(value, true)
        }}
      />
      {error && <span className="inline-error" role="alert">{error}</span>}
    </span>
  )
}
