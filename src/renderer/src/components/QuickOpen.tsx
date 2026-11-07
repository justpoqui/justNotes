// Quick open (Ctrl+P): type part of a page or section name, press Enter to go there.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Tree } from '../../../shared/types'
import { quickItems, quickSearch, type QuickMatch } from '../lib/quickOpen'
import { PageIcon, SectionIcon } from './Icons'

interface Props {
  tree: Tree
  /** Recently opened page keys, shown before anything is typed. */
  recent: string[]
  open(key: string): void
  onClose(): void
}

function Highlighted({ text, hits }: { text: string; hits: number[] }) {
  if (!hits.length) return <>{text}</>
  const set = new Set(hits)
  const parts: React.ReactNode[] = []
  for (let i = 0; i < text.length; ) {
    const on = set.has(i)
    let j = i
    while (j < text.length && set.has(j) === on) j++
    parts.push(on ? <mark key={i}>{text.slice(i, j)}</mark> : text.slice(i, j))
    i = j
  }
  return <>{parts}</>
}

export function QuickOpen({ tree, recent, open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const items = useMemo(() => quickItems(tree), [tree])

  const results: QuickMatch[] = useMemo(() => {
    if (query.trim()) return quickSearch(items, query)
    const byKey = new Map(items.map((i) => [i.key, i]))
    return recent.flatMap((k) => {
      const item = byKey.get(k)
      return item ? [{ ...item, score: 0, hits: [] }] : []
    })
  }, [items, query, recent])

  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const choose = (m: QuickMatch | undefined) => {
    if (!m) return
    onClose()
    open(m.key)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = results.length
    if (e.key === 'Escape') {
      e.preventDefault()
      return onClose()
    }
    if (!n) return
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) setIndex((i) => (i + 1) % n)
    else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) setIndex((i) => (i - 1 + n) % n)
    else if (e.key === 'PageDown') setIndex((i) => Math.min(n - 1, i + 8))
    else if (e.key === 'PageUp') setIndex((i) => Math.max(0, i - 8))
    else if (e.key === 'Enter') choose(results[index])
    else return
    e.preventDefault()
  }

  const pageCount = items.filter((i) => i.kind === 'page').length
  return (
    <div className="backdrop quick-backdrop" onMouseDown={onClose}>
      <div className="dialog quick-open" role="dialog" aria-modal="true" aria-label="Go to page" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <input
          className="dialog-input quick-input"
          autoFocus
          placeholder={`Go to a page or section (${pageCount} page${pageCount === 1 ? '' : 's'})…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          role="combobox"
          aria-expanded="true"
          aria-controls="quick-results"
          aria-activedescendant={results[index] ? `quick-${index}` : undefined}
          spellCheck={false}
        />
        {!query.trim() && results.length > 0 && <div className="quick-heading">Recent pages</div>}
        <ul id="quick-results" className="quick-results" role="listbox" ref={listRef}>
          {results.map((m, i) => (
            <li
              key={m.key}
              id={`quick-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === index}
              className={i === index ? 'selected' : ''}
              onMouseMove={() => i !== index && setIndex(i)}
              onClick={() => choose(m)}
            >
              <span className="quick-icon">{m.kind === 'page' ? <PageIcon /> : <SectionIcon />}</span>
              <span className="quick-name">
                <Highlighted text={m.name} hits={m.hits} />
              </span>
              <span className="quick-where">{m.kind === 'section' ? `Section in ${m.where}` : m.where}</span>
            </li>
          ))}
        </ul>
        {query.trim() && results.length === 0 && <p className="quick-empty">No page or section matches “{query.trim()}”.</p>}
        {!query.trim() && results.length === 0 && <p className="quick-empty">Start typing a page name.</p>}
        <div className="quick-help">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> choose
          </span>
          <span>
            <kbd>Enter</kbd> open
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
