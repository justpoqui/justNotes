import { describe, expect, it } from 'vitest'
import { findUnsupported, splitFrontMatter } from '../src/renderer/src/editor/preserve'

describe('splitFrontMatter', () => {
  it('separates front-matter and puts it back unchanged', () => {
    const md = '---\ntitle: Hi\ntags: [a, b]\n---\n\n# Body\n'
    const { frontMatter, body } = splitFrontMatter(md)
    expect(frontMatter).toBe('---\ntitle: Hi\ntags: [a, b]\n---\n\n')
    expect(body).toBe('# Body\n')
    expect(frontMatter + body).toBe(md)
  })
  it('leaves files without front-matter alone', () => {
    expect(splitFrontMatter('# A\n\n---\n\nB\n')).toEqual({ frontMatter: '', body: '# A\n\n---\n\nB\n' })
  })
  it('does not treat a leading divider as front-matter unless it closes', () => {
    expect(splitFrontMatter('---\n\nJust text\n').frontMatter).toBe('')
  })
})

describe('findUnsupported', () => {
  it('flags HTML, footnotes and reference links', () => {
    expect(findUnsupported('<div>x</div>')).toEqual(['HTML tags'])
    expect(findUnsupported('Text<br>more')).toEqual(['HTML tags'])
    expect(findUnsupported('A note[^1]\n\n[^1]: hi')).toEqual(['footnotes'])
    expect(findUnsupported('See [x][ref]\n\n[ref]: https://a.b')).toEqual(['reference-style links'])
  })
  it('ignores normal text and anything inside code', () => {
    expect(findUnsupported('3 < 4 and 5 > 2, [[Wiki]] [link](u) [1]')).toEqual([])
    expect(findUnsupported('```html\n<div>x</div>\n```\n\nUse `<br>` tags')).toEqual([])
  })
})
