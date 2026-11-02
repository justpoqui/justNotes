// @vitest-environment happy-dom
// Markdown round-trip tests: what the editor saves must load back identically,
// and the saved file should stay pleasant to read in a plain text editor.

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createExtensions, finishMarkdown } from '../src/renderer/src/editor/extensions'
import { escapeMarkdownText } from '../src/renderer/src/editor/markdownEscape'

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((e) => e.destroy()))

function load(md: string): Editor {
  const e = new Editor({ extensions: createExtensions(), content: md, contentType: 'markdown' } as any)
  editors.push(e)
  return e
}
const save = (e: Editor) => finishMarkdown((e as any).getMarkdown())
const roundTrip = (md: string) => save(load(md))

const SAMPLE = `# Title

Some **bold**, *italic*, ~~strike~~ and \`code\`. A [link](https://example.com) and [[Wiki Page]] and [[Other#Heading]].

## Tasks

- [ ] todo one
- [x] done two
  - [ ] nested

1. first
2. second

- bullet
  - nested bullet

> a quote

\`\`\`js
const x = 1 * 2 // <tag> & under_score
\`\`\`

![alt text](assets/pic.png)

---

Plain: 5 * 3, under_score, a_b_c, C:\\Users\\me, x < y, fish & chips, [1], #notheading, 2 ~ 3, AT&T.
`

describe('markdown round-trip', () => {
  it('is stable: saving twice gives the same file', () => {
    const once = roundTrip(SAMPLE)
    expect(roundTrip(once)).toBe(once)
  })

  it('keeps [[wiki links]] exactly', () => {
    const out = roundTrip(SAMPLE)
    expect(out).toContain('[[Wiki Page]]')
    expect(out).toContain('[[Other#Heading]]')
    const json = JSON.stringify(load(SAMPLE).getJSON())
    expect(json).toContain('"type":"wikiLink","attrs":{"target":"Wiki Page"}')
  })

  it('does not litter plain text with escapes', () => {
    const out = roundTrip(SAMPLE)
    expect(out).toContain('Plain: 5 * 3, under_score, a_b_c, C:\\Users\\me, x < y, fish & chips, [1], #notheading, 2 ~ 3, AT&T.')
    expect(out).toContain('const x = 1 * 2 // <tag> & under_score')
  })

  it('keeps tasks, nesting, lists, quotes, code, images and rules', () => {
    const out = roundTrip(SAMPLE)
    for (const part of ['# Title', '- [ ] todo one', '- [x] done two', '  - [ ] nested', '1. first', '  - nested bullet', '> a quote', '```js', '![alt text](assets/pic.png)', '---'])
      expect(out).toContain(part)
  })

  it('ends files with exactly one newline', () => {
    expect(roundTrip('# Hi\n\n\n')).toBe('# Hi\n')
  })

  // Text that looks like Markdown must come back as the same literal text.
  const tricky = [
    '*not italic*', '_not italic_', '**not bold**', '~~not struck~~', '`not code`', '[not](a link)',
    '[[not a wiki link]]', '![not](an image)', '<b>not html</b>', '&amp; literal entity', 'a\\*b', 'trailing backslash \\',
    'snake_case_name', '5 * 3 = 15', 'x_1 and _y', '[ref]: x', 'pipe | char', '[^1] footnote', 'end]', '<!-- c -->',
    'emoji 🎉 and café', 'mixed *a* _b_ `c` ~d~'
  ]
  it.each(tricky)('literal text survives: %s', (text) => {
    const e = load('')
    e.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
    const md = save(e)
    const back = load(md).getJSON()
    expect(back.content?.[0]?.content).toEqual([{ type: 'text', text }])
  })
})

describe('escapeMarkdownText', () => {
  it('leaves ordinary prose alone', () => {
    expect(escapeMarkdownText('Tom & Jerry: 3 < 4, snake_case, 2 * 2')).toBe('Tom & Jerry: 3 < 4, snake_case, 2 * 2')
  })
  it('escapes what could become formatting', () => {
    expect(escapeMarkdownText('*a*')).toBe('\\*a\\*')
    expect(escapeMarkdownText('[[x]]')).toBe('\\[[x]\\]')
    expect(escapeMarkdownText('<div>')).toBe('\\<div>')
    expect(escapeMarkdownText('&amp;')).toBe('\\&amp;')
  })
})
