// [[Wiki Link]] inline node. Phase 3 only keeps these intact (shown as a chip,
// saved back exactly as [[Target]]); Phase 4 adds navigation, autocomplete
// and backlinks.

import { InputRule, mergeAttributes, Node } from '@tiptap/core'

const LINK = /^\[\[([^[\]\n]+?)\]\]/

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { target: { default: '' } }
  },

  parseHTML() {
    return [{ tag: 'span[data-wiki-link]', getAttrs: (el) => ({ target: (el as HTMLElement).dataset.wikiLink ?? '' }) }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-wiki-link': node.attrs.target, class: 'wiki-link', title: node.attrs.target }),
      node.attrs.target
    ]
  },

  renderText({ node }) {
    return `[[${node.attrs.target}]]`
  },

  // ---- Markdown ----
  markdownTokenizer: {
    name: 'wikiLink',
    level: 'inline',
    start: (src: string) => src.indexOf('[['),
    tokenize(src: string) {
      const m = LINK.exec(src)
      if (!m) return undefined
      return { type: 'wikiLink', raw: m[0], target: m[1].trim() }
    }
  },
  parseMarkdown: (token) => ({ type: 'wikiLink', attrs: { target: String(token.target ?? '') } }),
  renderMarkdown: (node: { attrs?: { target?: string } }) => `[[${node.attrs?.target ?? ''}]]`,

  // Typing "[[Some Page]]" turns into a link chip.
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^[\]\n]+?)\]\]$/,
        handler: ({ state, range, match }) => {
          const target = match[1].trim()
          if (!target) return null
          state.tr.replaceWith(range.from, range.to, this.type.create({ target }))
        }
      })
    ]
  }
})
