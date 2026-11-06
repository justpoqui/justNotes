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

describe('text color, size and highlight', () => {
  it('saves and reloads colored / sized text and highlights', () => {
    const e = load('Plain')
    e.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'red big', marks: [{ type: 'textStyle', attrs: { color: '#e06c75', fontSize: '20px' } }] },
            { type: 'text', text: ' then ' },
            { type: 'text', text: 'marked', marks: [{ type: 'highlight' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'green', marks: [{ type: 'highlight', attrs: { color: '#a5d6a7' } }] }
          ]
        }
      ]
    })
    const md = save(e)
    expect(md).toBe('<span style="color: #e06c75; font-size: 20px">red big</span> then ==marked== and <mark style="background-color: #a5d6a7">green</mark>\n')
    const back = load(md).getJSON().content![0].content!
    expect(back[0]).toMatchObject({ text: 'red big', marks: [{ type: 'textStyle', attrs: { color: '#e06c75', fontSize: '20px' } }] })
    expect(back[2]).toMatchObject({ text: 'marked', marks: [{ type: 'highlight' }] })
    expect(back[4]).toMatchObject({ text: 'green', marks: [{ type: 'highlight', attrs: { color: '#a5d6a7' } }] })
    expect(roundTrip(md)).toBe(md)
  })

  it('combines with bold', () => {
    const md = '**<span style="color: #61afef">blue bold</span>** and [<span style="font-size: 20px">big link</span>](https://x.y)\n'
    expect(roundTrip(md)).toBe(md)
    const marks = load(md).getJSON().content![0].content![0].marks!.map((m) => m.type).sort()
    expect(marks).toEqual(['bold', 'textStyle'])
  })

  it('keeps special characters inside colored text', () => {
    const e = load('')
    const text = 'a < b & *c* `d` \\ ==e=='
    e.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'textStyle', attrs: { color: '#e06c75' } }] }] }] })
    const md = save(e)
    const back = load(md).getJSON().content![0].content!
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ text, marks: [{ type: 'textStyle', attrs: { color: '#e06c75' } }] })
  })

  it('nests plain highlight and colored text', () => {
    const md = '==<span style="color: #e06c75">red on yellow</span>==\n'
    expect(roundTrip(md)).toBe(md)
  })
})

describe('underline, alignment and font family', () => {
  it('round-trips underline and fonts', () => {
    const md = "<u>under</u> and <span style=\"font-family: 'DejaVu Serif'\">serif</span> and **<u>bold under</u>**\n"
    expect(roundTrip(md)).toBe(md)
    const p = load(md).getJSON().content![0].content!
    expect(p[0].marks![0].type).toBe('underline')
    expect(p[2].marks![0]).toMatchObject({ type: 'textStyle', attrs: { fontFamily: expect.stringContaining('DejaVu Serif') } })
  })

  it('round-trips aligned paragraphs and headings, keeping Markdown inside', () => {
    const md = '# Title\n\n<div align="center">\n\n## Centered **heading**\n\n</div>\n\n<div align="right">\n\nRight with *italic*\n\n</div>\n\nNormal\n'
    expect(roundTrip(md)).toBe(md)
    const doc = load(md).getJSON().content!
    expect(doc[1]).toMatchObject({ type: 'heading', attrs: { level: 2, textAlign: 'center' } })
    expect(doc[2]).toMatchObject({ type: 'paragraph', attrs: { textAlign: 'right' } })
    expect(doc[3].attrs?.textAlign ?? 'left').toBe('left')
  })

  it('does not treat these tags as unsupported HTML', async () => {
    const { findUnsupported } = await import('../src/renderer/src/editor/preserve')
    expect(findUnsupported('<u>x</u> <span style="font-family: \'Ubuntu\'">y</span>\n\n<div align="center">\n\nz\n\n</div>')).toEqual([])
  })
})


describe('pictures', () => {
  it('keeps a picture width (![alt|300](…)) and alignment', () => {
    const md = 'Intro\n\n![logo|300](assets/a%20b.png)\n\n<div align="center">\n\n![|120](assets/c.png)\n\n</div>\n\n![plain](assets/d.png)\n'
    const e = load(md)
    const imgs = (e.getJSON().content ?? []).flatMap((n: any) => (n.type === 'image' ? [n] : (n.content ?? []).filter((c: any) => c.type === 'image')))
    expect(imgs.map((i: any) => [i.attrs.alt, i.attrs.width, i.attrs.textAlign ?? null])).toEqual([
      ['logo', 300, null],
      ['', 120, 'center'],
      ['plain', null, null]
    ])
    expect(save(e)).toBe(md)
  })
  it('a new width is written into the file', () => {
    const e = load('![x](p.png)\n')
    e.commands.setNodeSelection(0)
    e.commands.updateAttributes('image', { width: 250 })
    e.commands.setTextAlign('right')
    expect(save(e)).toBe('<div align="right">\n\n![x|250](p.png)\n\n</div>\n')
  })
})
