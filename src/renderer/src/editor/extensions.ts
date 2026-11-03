// The editor's extension list, shared by the app and the tests so the
// Markdown round-trip that's tested is exactly what the app uses.

import { Extension, type AnyExtension } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import TextAlign from '@tiptap/extension-text-align'
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import { escapeHtmlText, escapeMarkdownText } from './markdownEscape'
import { WikiLink } from './WikiLink'

const lowlight = createLowlight(common)

// Markdown has no font size, text colour or coloured highlight, so those are
// written as small inline HTML tags that most Markdown viewers still display:
//   <span style="color: #e06c75; font-size: 20px">text</span>
//   ==plain highlight==   or   <mark style="background-color: #a5d6a7">coloured</mark>
const SAFE_CSS_VALUE = /^[#\w\s.,()%'-]+$/

/** Text colour + font size, saved as <span style="..."> */
const StyledText = TextStyle.extend({
  // Lowest priority = innermost tag, so bold/italic/links wrap it in Markdown
  // ("**<span ...>x</span>**"). Markdown inside an HTML tag would not be read back.
  priority: 40,
  renderMarkdown: (node: any, h: any) => {
    const content = h.renderChildren(node)
    const css: string[] = []
    const { color, fontSize } = node.attrs ?? {}
    // Font names are written with single quotes so they fit inside style="...".
    const fontFamily = typeof node.attrs?.fontFamily === 'string' ? node.attrs.fontFamily.replace(/"/g, "'") : ''
    if (color && SAFE_CSS_VALUE.test(color)) css.push(`color: ${color}`)
    if (fontSize && SAFE_CSS_VALUE.test(fontSize)) css.push(`font-size: ${fontSize}`)
    if (fontFamily && SAFE_CSS_VALUE.test(fontFamily)) css.push(`font-family: ${fontFamily}`)
    return css.length ? `<span style="${css.join('; ')}">${content}</span>` : content
  }
})

/** Highlight: "==text==" for the default colour, <mark style> for others. */
const ColorHighlight = Highlight.extend({
  priority: 45,
  // Like the standard "==text==" reader, but the text may contain HTML tags such as
  // <span style="color: …"> (whose "=" would otherwise end the highlight early).
  markdownTokenizer: {
    name: 'highlight',
    level: 'inline',
    start: (src: string) => src.indexOf('=='),
    tokenize(src: string, _tokens: any, h: any) {
      const m = /^==(?!\s)((?:<[^<>\n]*>|[^=<\n])+?)==/.exec(src)
      if (!m || /\s$/.test(m[1])) return undefined
      return { type: 'highlight', raw: m[0], text: m[1], tokens: h.inlineTokens(m[1]) }
    }
  },
  renderMarkdown: (node: any, h: any) => {
    const content = h.renderChildren(node)
    const color = node.attrs?.color
    if (color && SAFE_CSS_VALUE.test(color)) return `<mark style="background-color: ${color}">${content}</mark>`
    return `==${content}==`
  }
}).configure({ multicolor: true })

/** Underline, saved as <u>text</u> (Markdown has no underline). */
const HtmlUnderline = Underline.extend({
  priority: 42,
  renderMarkdown: (node: any, h: any) => `<u>${h.renderChildren(node)}</u>`
})

// Text alignment (left is the default and isn't written). Markdown has none, so an
// aligned paragraph or heading is wrapped like this, which GitHub & co. also show:
//   <div align="center">
//
//   The paragraph, with **normal** Markdown inside.
//
//   </div>
const ALIGNED = /^<div align="(left|center|right|justify)">\n\n([\s\S]*?)\n\n<\/div>(?:\n+|$)/
const wrapAligned = (md: string, node: any, ctx: any) => {
  const align = node.attrs?.textAlign
  // Only for top-level blocks: inside lists or tables the wrapper would break the Markdown.
  return align && align !== 'left' && (!ctx || !ctx.parentType || ctx.parentType === 'doc') ? `<div align="${align}">\n\n${md}\n\n</div>` : md
}
/**
 * Text at the start of a line that Markdown would read as a list, heading, quote or
 * divider ("1. ", "- ", "# ", "> ", "---") is escaped, so typed text stays text.
 */
export function escapeLineStarts(md: string): string {
  return md
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*)(\d{1,9})([.)])(?=\s|$)/, '$1$2\\$3')
        .replace(/^(\s*)([-+*])(?=\s|$)/, '$1\\$2')
        .replace(/^(\s*)(-)(?=-{2,}\s*$)/, '$1\\$2')
        .replace(/^(\s*)(#{1,6})(?=\s|$)/, '$1\\$2')
        .replace(/^(\s*)>/, '$1\\>')
    )
    .join('\n')
}

const AlignedParagraph = Paragraph.extend({
  renderMarkdown(node: any, h: any, ctx: any) {
    return wrapAligned(escapeLineStarts(this.parent!(node, h, ctx)), node, ctx)
  }
})
const AlignedHeading = Heading.extend({
  renderMarkdown(node: any, h: any, ctx: any) {
    return wrapAligned(this.parent!(node, h, ctx), node, ctx)
  }
})
const AlignedBlocks = Extension.create({
  name: 'alignedBlocks',
  markdownTokenName: 'alignedBlock',
  markdownTokenizer: {
    name: 'alignedBlock',
    level: 'block',
    start: (src: string) => src.indexOf('<div align='),
    tokenize(src: string, _tokens: any, lexer: any) {
      const m = ALIGNED.exec(src)
      if (!m) return undefined
      return { type: 'alignedBlock', raw: m[0], align: m[1], tokens: lexer.blockTokens(m[2]) }
    }
  },
  parseMarkdown: (token: any, h: any) =>
    h.parseChildren(token.tokens ?? []).map((n: any) =>
      n.type === 'paragraph' || n.type === 'heading' ? { ...n, attrs: { ...(n.attrs ?? {}), textAlign: token.align } } : n
    )
})

/** Marks that are saved as HTML tags rather than Markdown syntax. */
const isHtmlMark = (m: any) =>
  typeof m === 'object' &&
  ((m.type === 'textStyle' && (m.attrs?.color || m.attrs?.fontSize || m.attrs?.fontFamily)) || (m.type === 'highlight' && m.attrs?.color) || m.type === 'underline')

/** Swaps TipTap's heavy-handed text escaping for escapeMarkdownText. */
const ReadableMarkdown = Extension.create({
  name: 'readableMarkdown',
  onBeforeCreate() {
    const manager = (this.editor as unknown as { markdown?: any }).markdown ?? (this.editor.storage as any).markdown?.manager
    if (!manager) return
    manager.encodeTextForMarkdown = function (text: string, node: any, parent: any) {
      const inCode =
        (parent?.type && this.codeTypes?.has(parent.type)) ||
        (node.marks || []).some((m: any) => this.codeTypes?.has(typeof m === 'string' ? m : m.type))
      if (inCode) return text
      // Inside an HTML tag (coloured/sized text) the text is read back as HTML, not Markdown.
      const marks = node.marks || []
      if (marks.some(isHtmlMark)) return escapeHtmlText(text)
      // Inside "==highlight==" any "=" would end it early, so write it as &#61; (read back as "=").
      const has = (type: string) => marks.some((m: any) => (typeof m === 'string' ? m : m.type) === type)
      let out = escapeMarkdownText(text)
      if (has('highlight')) out = out.replace(/\\?=/g, '&#61;').replace(/\\?</g, '&lt;')
      // Inside [link text] every bracket must be escaped, or the link text ends early.
      if (has('link')) out = out.replace(/(?<!\\)([[\]])/g, '\\$1')
      return out
    }
  }
})

export interface ExtensionOptions {
  /** Turns a Markdown image path ("assets/a.png") into a URL the window can load. */
  resolveImageSrc?: (src: string) => string
  placeholder?: string
  extra?: AnyExtension[]
}

export function createExtensions({ resolveImageSrc = (s) => s, placeholder, extra = [] }: ExtensionOptions = {}): AnyExtension[] {
  const PageImage = Image.extend({
    // Spaces and brackets in a file name would break the Markdown link, so they're
    // written as %20 / %28 / %29 (every Markdown viewer understands those).
    renderMarkdown: (node: any) => {
      const src = String(node.attrs?.src ?? '').replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')
      const alt = String(node.attrs?.alt ?? '').replace(/([\\[\]])/g, '\\$1')
      const title = node.attrs?.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : ''
      return `![${alt}](${src}${title})`
    },
    // The document (and so the saved Markdown) keeps the relative path;
    // only what's drawn on screen uses the resolved URL.
    renderHTML({ HTMLAttributes }) {
      return ['img', { ...HTMLAttributes, src: resolveImageSrc(String(HTMLAttributes.src ?? '')) }]
    }
  })

  return [
    StarterKit.configure({
      codeBlock: false, // replaced by the syntax-highlighted version
      underline: false, // replaced by HtmlUnderline (<u>…</u>)
      paragraph: false, // replaced by the alignment-aware versions below
      heading: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' }
    }),
    AlignedParagraph,
    AlignedHeading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    AlignedBlocks,
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    HtmlUnderline,
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    TaskList,
    TaskItem.configure({ nested: true }),
    StyledText,
    Color,
    FontSize,
    FontFamily,
    ColorHighlight,
    PageImage.configure({ allowBase64: true }),
    TableKit.configure({ table: { resizable: false } }),
    WikiLink,
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : (placeholder ?? "Type '/' for blocks")),
      includeChildren: false
    }),
    Markdown.configure({ indentation: { style: 'space', size: 2 } }),
    ReadableMarkdown,
    ...extra
  ]
}

/** Normalises what we write: exactly one trailing newline. */
export const finishMarkdown = (md: string): string => md.replace(/\s+$/, '') + '\n'
