// Spell-check underlines, AutoCorrect, AutoFormat and smart quotes for the page editor.
//
// Automatic changes happen when you type a space or punctuation after a word.
// Pressing Ctrl+Z straight afterwards puts back exactly what you typed (and that
// word is then left alone for the rest of the session).

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { getSettings, subscribeSettings } from '../lib/settings'
import { autocorrectWord, autoformat, smartQuote, startsSentence } from './rules'
import { getSpellChecker, isMisspelled } from './spellchecker'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    proofing: {
      /** Reverts the automatic change made just before the cursor, if there is one. */
      revertAutoChange: () => ReturnType
    }
  }
}

/** Words the user reverted or chose "Ignore" for (this session only). */
export const ignoredWords = new Set<string>()

interface AutoChange {
  from: number
  to: number
  original: string
  /** The document right after the change; any other edit cancels the undo. */
  doc: PMNode
  cursor: number
  word: string | null
}

export const spellKey = new PluginKey<DecorationSet>('spellcheck')
const BOUNDARY = /^[\s.,;:!?)\]}"'”’]$/
const WORD_BEFORE = /([\p{L}][\p{L}'’]*)$/u
const WORD = /[\p{L}][\p{L}'’]*/gu

const inCode = (state: EditorState, pos: number) => {
  const $pos = state.doc.resolve(pos)
  return !!$pos.parent.type.spec.code || $pos.marks().some((m) => m.type.spec.code)
}

/** Underline decorations for every misspelled word in the document. */
function findMisspellings(doc: PMNode, cursor: number | null): DecorationSet {
  if (!getSettings().spellcheck) return DecorationSet.empty
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.spec.code) return false
    if (!node.isText || !node.text) return true
    if (node.marks.some((m) => m.type.spec.code || m.type.name === 'link')) return false
    for (const m of node.text.matchAll(WORD)) {
      const from = pos + m.index!
      const to = from + m[0].length
      if (cursor !== null && cursor >= from && cursor <= to) continue // still being typed
      // Skip pieces of URLs, e-mail addresses and file names.
      const prev = node.text[m.index! - 1]
      const after = node.text.slice(m.index! + m[0].length, m.index! + m[0].length + 2)
      if ((prev && /[\w@./\\:-]/.test(prev)) || /^[\w@/\\]|^\.\w/.test(after)) continue
      const word = m[0].replace(/['’]+$/, '')
      if (ignoredWords.has(word.toLowerCase()) || !isMisspelled(word)) continue
      decos.push(Decoration.inline(from, from + word.length, { class: 'spell-error', 'data-word': word }))
    }
    return false
  })
  return DecorationSet.create(doc, decos)
}

export const Proofing = Extension.create({
  name: 'proofing',
  // Before the normal undo shortcut, so Ctrl+Z right after an automatic change reverts just that.
  priority: 1000,

  addStorage() {
    return { last: null as AutoChange | null }
  },

  addCommands() {
    return {
      revertAutoChange:
        () =>
        ({ state, dispatch }) => {
          const last = this.storage.last as AutoChange | null
          if (!last || state.doc !== last.doc || !state.selection.empty || state.selection.from !== last.cursor) return false
          if (dispatch) {
            dispatch(state.tr.insertText(last.original, last.from, last.to))
            if (last.word) ignoredWords.add(last.word.toLowerCase())
          }
          this.storage.last = null
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage as { last: AutoChange | null }
    const editor = this.editor

    const record = (view: EditorView, change: Omit<AutoChange, 'doc' | 'cursor'>) => {
      storage.last = { ...change, doc: view.state.doc, cursor: view.state.selection.from }
    }

    const autoPlugin = new Plugin({
      props: {
        handleTextInput(view, from, to, text) {
          const s = getSettings()
          const { state } = view
          if (!(s.autocorrect || s.autoformat || s.smartQuotes || s.capitalizeSentences) || inCode(state, from)) return false
          const $from = state.doc.resolve(from)
          const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 80), $from.parentOffset, undefined, '￼')

          // Smart quotes: replace the quote as it is typed.
          if (s.smartQuotes && (text === '"' || text === "'")) {
            const curly = smartQuote(text, before.slice(-1) || undefined)
            view.dispatch(state.tr.insertText(curly, from, to))
            record(view, { from, to: from + 1, original: text, word: null })
            return true
          }
          if (!BOUNDARY.test(text)) return false

          // AutoFormat: (c) → ©, -- → –, -> → →, ...
          if (s.autoformat) {
            const af = autoformat(before)
            if (af) {
              const start = from - af.length
              view.dispatch(state.tr.insertText(af.replace + text, start, to))
              record(view, { from: start, to: start + af.replace.length, original: before.slice(-af.length), word: null })
              return true
            }
          }

          // AutoCorrect the word just finished.
          const m = WORD_BEFORE.exec(before)
          if (!m) return false
          const word = m[1].replace(/['’]+$/, '')
          if (word !== m[1]) return false
          const preceding = before.slice(0, before.length - word.length)
          const token = preceding.split(/\s/).pop() ?? ''
          if (/[\w@./\\:#-]$/.test(token)) return false // part of a URL, e-mail, path, #tag or hyphenated word
          let fixed = s.autocorrect
            ? autocorrectWord(word, { replacements: s.replacements, fixNearMisses: s.fixNearMisses, checker: s.spellcheck || s.fixNearMisses ? getSpellChecker() : null, ignore: ignoredWords })
            : null
          if (s.capitalizeSentences && !ignoredWords.has(word.toLowerCase()) && startsSentence(preceding)) {
            const w = fixed ?? word
            if (/^\p{Ll}/u.test(w)) fixed = w[0].toUpperCase() + w.slice(1)
          }
          if (!fixed || fixed === word) return false
          const start = from - word.length
          view.dispatch(state.tr.insertText(fixed + text, start, to))
          record(view, { from: start, to: start + fixed.length, original: word, word })
          return true
        },

        handleKeyDown(_view, event) {
          const undo = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z'
          if (undo && editor.commands.revertAutoChange()) {
            event.preventDefault()
            return true
          }
          return false
        }
      }
    })

    // Misspelling underlines, recomputed shortly after typing stops.
    const spellPlugin = new Plugin<DecorationSet>({
      key: spellKey,
      state: {
        init: (_, state) => findMisspellings(state.doc, null),
        apply: (tr, set) => (tr.getMeta(spellKey) as DecorationSet | undefined) ?? set.map(tr.mapping, tr.doc)
      },
      props: {
        decorations: (state) => spellKey.getState(state)
      },
      view(view) {
        let timer: ReturnType<typeof setTimeout> | undefined
        const refresh = (delay: number) => {
          clearTimeout(timer)
          timer = setTimeout(() => {
            if (view.isDestroyed) return
            const sel = view.state.selection
            view.dispatch(view.state.tr.setMeta(spellKey, findMisspellings(view.state.doc, sel.empty ? sel.from : null)).setMeta('addToHistory', false))
          }, delay)
        }
        const unsubscribe = subscribeSettings(() => refresh(0))
        return {
          update(v, prev) {
            if (v.state.doc !== prev.doc) refresh(400)
          },
          destroy() {
            clearTimeout(timer)
            unsubscribe()
          }
        }
      }
    })

    return [autoPlugin, spellPlugin]
  }
})

/** Re-runs spell-check now (after "Add to dictionary" / "Ignore"). */
export function refreshSpelling(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(spellKey, findMisspellings(view.state.doc, null)).setMeta('addToHistory', false))
}
