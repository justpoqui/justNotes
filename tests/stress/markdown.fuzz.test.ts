// @vitest-environment happy-dom
// Randomised round-trip test: build random documents from every kind of block and
// mark the editor supports, save → load → save, and require (1) the file to be
// stable after the first save and (2) no text to go missing.
import { Editor, type JSONContent } from '@tiptap/core'
import { afterEach, expect, it } from 'vitest'
import { createExtensions, finishMarkdown } from '../../src/renderer/src/editor/extensions'

let seed = Number(process.env.FUZZ_SEED ?? 12345)
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)]
const WORDS = ['note', 'plan', 'café', '日本', '🎉', 'snake_case', 'a*b', '5 * 3', '[x]', '<tag>', 'AT&T', 'x | y', '`tick`', 'path\\to', '~tilde', '#hash', '1. not', '- dash', '==eq==', '"quote"', "it's", '{brace}', '$dollar', '50%']
const text = () => Array.from({ length: 1 + Math.floor(rand() * 6) }, () => pick(WORDS)).join(' ')
const COLORS = ['#e06c75', '#4f8fe6']
const markSets: (JSONContent['marks'] | undefined)[] = [
  undefined, [{ type: 'bold' }], [{ type: 'italic' }], [{ type: 'strike' }], [{ type: 'code' }], [{ type: 'underline' }],
  [{ type: 'highlight' }], [{ type: 'highlight', attrs: { color: '#b8e6a6' } }], [{ type: 'textStyle', attrs: { color: pick(COLORS), fontSize: '20px' } }],
  [{ type: 'link', attrs: { href: 'https://example.com/a_b' } }], [{ type: 'bold' }, { type: 'textStyle', attrs: { fontFamily: "'DejaVu Serif'" } }]
]
const inline = (): JSONContent[] => {
  const out: JSONContent[] = []
  for (let i = 0; i < 1 + Math.floor(rand() * 4); i++) {
    if (i) out.push({ type: 'text', text: ' ' })
    if (rand() < 0.08) out.push({ type: 'wikiLink', attrs: { target: 'Some Page' } })
    else {
      const marks = pick(markSets)
      out.push(marks ? { type: 'text', text: text(), marks } : { type: 'text', text: text() })
    }
  }
  return out
}
const para = (): JSONContent => ({ type: 'paragraph', attrs: rand() < 0.15 ? { textAlign: pick(['center', 'right']) } : {}, content: inline() })
const block = (): JSONContent => {
  const r = rand()
  if (r < 0.35) return para()
  if (r < 0.45) return { type: 'heading', attrs: { level: 1 + Math.floor(rand() * 3) }, content: [{ type: 'text', text: text() }] }
  if (r < 0.55) return { type: 'bulletList', content: [{ type: 'listItem', content: [para()] }, { type: 'listItem', content: [para()] }] }
  if (r < 0.62) return { type: 'orderedList', content: [{ type: 'listItem', content: [para()] }] }
  if (r < 0.7) return { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: rand() < 0.5 }, content: [para()] }] }
  if (r < 0.76) return { type: 'blockquote', content: [para()] }
  if (r < 0.82) return { type: 'codeBlock', attrs: { language: pick(['js', null]) }, content: [{ type: 'text', text: 'const a = 1 * 2 // <x> & _y_' }] }
  if (r < 0.86) return { type: 'horizontalRule' }
  if (r < 0.9) return { type: 'image', attrs: { src: 'assets/pic one.png', alt: 'alt' } }
  return { type: 'paragraph', content: [{ type: 'text', text: text() }] }
}

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((e) => e.destroy()))
const make = (content: JSONContent | string, md = false) => {
  const e = new Editor({ extensions: createExtensions(), content, ...(md ? { contentType: 'markdown' } : {}) } as any)
  editors.push(e)
  return e
}
const save = (e: Editor) => finishMarkdown((e as any).getMarkdown())
// Compare visible text, ignoring whitespace (Markdown normalises spacing).
// Formatting of every visible character (whitespace ignored), e.g. "bold+link".
const formatting = (e: Editor) => {
  const out: string[] = []
  e.state.doc.descendants((n) => {
    if (!n.isText) return true
    const sig = n.marks
      .map((m) => m.type.name + (m.type.name === 'highlight' && m.attrs.color ? ':' + m.attrs.color : '') + (m.type.name === 'textStyle' ? ':' + [m.attrs.color, m.attrs.fontSize, m.attrs.fontFamily && 'font'].filter(Boolean).join(',') : ''))
      .sort()
      .join('+')
    for (const ch of n.text!) if (!/\s/.test(ch)) out.push(sig)
    return false
  })
  return out.join('|')
}
const words = (e: Editor) => e.state.doc.textBetween(0, e.state.doc.content.size, ' ', ' ').replace(/\s+/g, ' ').trim()

it('400 random documents survive save → load → save', () => {
  const failures: string[] = []
  for (let i = 0; i < Number(process.env.FUZZ_N ?? 400); i++) {
    const doc: JSONContent = { type: 'doc', content: Array.from({ length: 2 + Math.floor(rand() * 6) }, block) }
    const original = make(doc)
    const md1 = save(original)
    const loaded = make(md1, true)
    const md2 = save(loaded)
    const md3 = save(make(md2, true))
    if (md2 !== md3) failures.push(`#${i} not stable:\n${md2}\n---\n${md3}`)
    if (words(loaded) === words(original) && formatting(loaded) !== formatting(original)) {
      const a = formatting(original).split('|'), b = formatting(loaded).split('|')
      const at = a.findIndex((x, k) => x !== b[k])
      failures.push(`#${i} formatting changed at char ${at}: ${a[at]} → ${b[at]}\n  text: ${words(original)}\n  file:\n${md1}`)
    }
    if (words(loaded) !== words(original)) failures.push(`#${i} text changed:\n  before: ${words(original)}\n  after:  ${words(loaded)}\n  file:\n${md1}`)
  }
  if (failures.length) console.log(failures.slice(0, 3).join('\n=====\n'))
  expect(failures.length).toBe(0)
}, 120_000)
