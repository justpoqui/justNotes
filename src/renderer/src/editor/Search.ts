// Find & Replace inside the open page: highlights all matches, steps through
// them, replaces one or all.

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface SearchQuery {
  text: string
  caseSensitive: boolean
  wholeWord: boolean
}

export interface SearchState {
  query: SearchQuery
  matches: { from: number; to: number }[]
  current: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    search: {
      setSearch: (query: SearchQuery) => ReturnType
      clearSearch: () => ReturnType
      /** Moves to the next (or previous) match and selects it. */
      findNext: (backwards?: boolean) => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAll: (replacement: string) => ReturnType
    }
  }
}

export const searchKey = new PluginKey<SearchState>('search')
const EMPTY: SearchState = { query: { text: '', caseSensitive: false, wholeWord: false }, matches: [], current: -1 }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** All matches in the document. Text never matches across paragraphs or inline items (links chips, images). */
export function findMatches(doc: PMNode, q: SearchQuery): { from: number; to: number }[] {
  if (!q.text) return []
  const body = escapeRe(q.text)
  const re = new RegExp(q.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body, q.caseSensitive ? 'gu' : 'giu')
  const out: { from: number; to: number }[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // One character per document position: text as is, other inline nodes as a placeholder.
    let text = ''
    node.forEach((child) => {
      text += child.isText ? child.text : '￼'.repeat(child.nodeSize)
    })
    for (const m of text.matchAll(re)) if (m[0].length) out.push({ from: pos + 1 + m.index!, to: pos + 1 + m.index! + m[0].length })
    return false
  })
  return out
}

export const Search = Extension.create({
  name: 'search',

  addCommands() {
    const select = (tr: any, m: { from: number; to: number }) => tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView()
    return {
      setSearch:
        (query) =>
        ({ state, dispatch }) => {
          const matches = findMatches(state.doc, query)
          // Start at the first match after the cursor.
          const current = matches.length ? Math.max(0, matches.findIndex((m) => m.from >= state.selection.from)) : -1
          if (dispatch) {
            const tr = state.tr.setMeta(searchKey, { query, matches, current })
            dispatch(current >= 0 ? select(tr, matches[current]) : tr)
          }
          return true
        },
      clearSearch:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) dispatch(state.tr.setMeta(searchKey, EMPTY))
          return true
        },
      findNext:
        (backwards = false) =>
        ({ state, dispatch }) => {
          const s = searchKey.getState(state)!
          if (!s.matches.length) return false
          const n = s.matches.length
          const current = (s.current + (backwards ? -1 : 1) + n) % n
          if (dispatch) dispatch(select(state.tr.setMeta(searchKey, { ...s, current }), s.matches[current]))
          return true
        },
      replaceCurrent:
        (replacement) =>
        ({ state, dispatch }) => {
          const s = searchKey.getState(state)!
          const m = s.matches[s.current]
          if (!m) return false
          if (dispatch) {
            const tr = state.tr.insertText(replacement, m.from, m.to)
            const matches = findMatches(tr.doc, s.query)
            const next = matches.findIndex((x) => x.from >= m.from + replacement.length)
            const current = matches.length ? (next < 0 ? 0 : next) : -1
            tr.setMeta(searchKey, { ...s, matches, current })
            dispatch(current >= 0 ? select(tr, matches[current]) : tr)
          }
          return true
        },
      replaceAll:
        (replacement) =>
        ({ state, dispatch }) => {
          const s = searchKey.getState(state)!
          if (!s.matches.length) return false
          if (dispatch) {
            const tr = state.tr
            for (const m of [...s.matches].reverse()) tr.insertText(replacement, m.from, m.to)
            tr.setMeta(searchKey, { ...s, matches: findMatches(tr.doc, s.query), current: -1 })
            dispatch(tr)
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => EMPTY,
          apply(tr, value) {
            const meta = tr.getMeta(searchKey) as SearchState | undefined
            if (meta) return meta
            if (!tr.docChanged || !value.query.text) return value
            // Typing while the find bar is open: refresh matches, keep roughly the same place.
            const matches = findMatches(tr.doc, value.query)
            return { ...value, matches, current: Math.min(value.current, matches.length - 1) }
          }
        },
        props: {
          decorations(state) {
            const s = searchKey.getState(state)!
            if (!s.matches.length) return null
            return DecorationSet.create(
              state.doc,
              s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? 'search-match current' : 'search-match' }))
            )
          }
        }
      })
    ]
  }
})
