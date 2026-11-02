// The editor's extension list, shared by the app and the tests so the
// Markdown round-trip that's tested is exactly what the app uses.

import { Extension, type AnyExtension } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import { escapeMarkdownText } from './markdownEscape'
import { WikiLink } from './WikiLink'

const lowlight = createLowlight(common)

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
      return inCode ? text : escapeMarkdownText(text)
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
