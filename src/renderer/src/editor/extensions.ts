// The editor's extension list, shared by the app and the tests so the
// Markdown round-trip that's tested is exactly what the app uses.

import { Extension, type AnyExtension } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import { escapeMarkdownText } from './markdownEscape'
import { WikiLink } from './WikiLink'

const lowlight = createLowlight(common)

// Markdown has no font size, text colour or coloured highlight, so those are
// written as small inline HTML tags that most Markdown viewers still display:
//   <span style="color: #e06c75; font-size: 20px">text</span>
//   ==plain highlight==   or   <mark style="background-color: #a5d6a7">coloured</mark>
const SAFE_CSS_VALUE = /^[#\w\s.,()%-]+$/

/** Text colour + font size, saved as <span style="..."> */
const StyledText = TextStyle.extend({
  // Lowest priority = innermost tag, so bold/italic/links wrap it in Markdown
  // ("**<span ...>x</span>**"). Markdown inside an HTML tag would not be read back.
  priority: 40,
  renderMarkdown: (node: any, h: any) => {
    const content = h.renderChildren(node)
    const css: string[] = []
    const { color, fontSize } = node.attrs ?? {}
    if (color && SAFE_CSS_VALUE.test(color)) css.push(`color: ${color}`)
    if (fontSize && SAFE_CSS_VALUE.test(fontSize)) css.push(`font-size: ${fontSize}`)
    return css.length ? `<span style="${css.join('; ')}">${content}</span>` : content
  }
})

/** Highlight: "==text==" for the default colour, <mark style> for others. */
const ColorHighlight = Highlight.extend({
  priority: 45,
  renderMarkdown: (node: any, h: any) => {
    const content = h.renderChildren(node)
    const color = node.attrs?.color
    return color && SAFE_CSS_VALUE.test(color) ? `<mark style="background-color: ${color}">${content}</mark>` : `==${content}==`
  }
}).configure({ multicolor: true })

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Marks that are saved as HTML tags rather than Markdown syntax. */
const isHtmlMark = (m: any) =>
  typeof m === 'object' && ((m.type === 'textStyle' && (m.attrs?.color || m.attrs?.fontSize)) || (m.type === 'highlight' && m.attrs?.color))

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
      return (node.marks || []).some(isHtmlMark) ? escapeHtml(text) : escapeMarkdownText(text)
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
    // The document (and so the saved Markdown) keeps the relative path;
    // only what's drawn on screen uses the resolved URL.
    renderHTML({ HTMLAttributes }) {
      return ['img', { ...HTMLAttributes, src: resolveImageSrc(String(HTMLAttributes.src ?? '')) }]
    }
  })

  return [
    StarterKit.configure({
      codeBlock: false, // replaced by the syntax-highlighted version
      underline: false, // Markdown has no underline
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' }
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    TaskList,
    TaskItem.configure({ nested: true }),
    StyledText,
    Color,
    FontSize,
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
