// "/" menu for inserting blocks. The extension only tracks the trigger and
// reports state; the menu itself is drawn by React (SlashMenu in PageEditor).

import { Extension, type Editor, type Range } from '@tiptap/core'
import { insertDate } from './dateTime'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { exitSuggestion } from '@tiptap/suggestion'

export interface SlashItem {
  id: string
  title: string
  hint: string
  keywords: string[]
  run(editor: Editor, range: Range): void
}

export interface SlashMenuState {
  items: SlashItem[]
  rect: DOMRect | null
  choose(item: SlashItem): void
}

export interface SlashOptions {
  items(query: string): SlashItem[]
  onChange(state: SlashMenuState | null): void
  /** Return true if the key was handled (arrows, Enter, Escape while the menu is open). */
  onKeyDown(event: KeyboardEvent): boolean
}

export const slashKey = new PluginKey('slashCommand')

export const SlashCommand = Extension.create<SlashOptions>({
  name: 'slashCommand',

  addOptions() {
    return { items: () => [], onChange: () => {}, onKeyDown: () => false }
  },

  addProseMirrorPlugins() {
    const options = this.options
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: slashKey,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        // Not inside code blocks or inline code, where "/" is just a character.
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          if ($from.parent.type.spec.code) return false
          return !$from.marks().some((m) => m.type.spec.code)
        },
        items: ({ query }) => options.items(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          const report = (p: { items: SlashItem[]; clientRect?: (() => DOMRect | null) | null; command: (i: SlashItem) => void }) =>
            options.onChange({ items: p.items, rect: p.clientRect?.() ?? null, choose: p.command })
          return {
            onStart: report,
            onUpdate: report,
            onExit: () => options.onChange(null),
            onKeyDown: ({ event, view }) => {
              if (event.key === 'Escape') {
                exitSuggestion(view, slashKey)
                return true
              }
              return options.onKeyDown(event)
            }
          }
        }
      })
    ]
  }
})

/** Builds the list of block types offered by "/". */
export function slashItems(pickImage: () => Promise<string | null>): SlashItem[] {
  const block = (id: string, title: string, hint: string, keywords: string[], apply: (e: Editor) => void): SlashItem => ({
    id,
    title,
    hint,
    keywords,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run()
      apply(editor)
    }
  })
  return [
    block('text', 'Text', 'Plain paragraph', ['paragraph', 'p'], (e) => e.chain().focus().setParagraph().run()),
    block('h1', 'Heading 1', 'Big section heading', ['title', '#'], (e) => e.chain().focus().setHeading({ level: 1 }).run()),
    block('h2', 'Heading 2', 'Medium heading', ['subtitle', '##'], (e) => e.chain().focus().setHeading({ level: 2 }).run()),
    block('h3', 'Heading 3', 'Small heading', ['###'], (e) => e.chain().focus().setHeading({ level: 3 }).run()),
    block('todo', 'To-do list', 'Track tasks with checkboxes', ['task', 'check', 'checkbox', '[]'], (e) =>
      e.chain().focus().toggleTaskList().run()
    ),
    block('bullet', 'Bulleted list', 'Simple list', ['ul', 'unordered', '-'], (e) => e.chain().focus().toggleBulletList().run()),
    block('numbered', 'Numbered list', 'List with numbers', ['ol', 'ordered', '1.'], (e) => e.chain().focus().toggleOrderedList().run()),
    block('quote', 'Quote', 'Quoted text', ['blockquote', '>'], (e) => e.chain().focus().toggleBlockquote().run()),
    block('code', 'Code block', 'Code with syntax highlighting', ['```', 'snippet', 'pre'], (e) => e.chain().focus().toggleCodeBlock().run()),
    block('divider', 'Divider', 'Horizontal line', ['hr', 'rule', 'separator', '---'], (e) => e.chain().focus().setHorizontalRule().run()),
    block('table', 'Table', '3 × 3 table', ['grid'], (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
    block('date', 'Date', "Today's date (Alt+Shift+D)", ['today', 'day', 'now'], (e) => insertDate(e, 'long')),
    block('time', 'Time', 'The time now (Alt+Shift+T)', ['clock', 'now'], (e) => insertDate(e, 'time')),
    {
      id: 'image',
      title: 'Picture',
      hint: 'Insert a picture from your computer',
      keywords: ['image', 'photo', 'img'],
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).run()
        void pickImage().then((src) => {
          if (src) editor.chain().focus().setImage({ src, alt: '' }).run()
        })
      }
    }
  ]
}

export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((i) => i.title.toLowerCase().includes(q) || i.keywords.some((k) => k.toLowerCase().startsWith(q)))
}
