// Insert ▸ Date & time, "/date", "/time", Alt+Shift+D and Alt+Shift+T. Inserted as plain text
// (not a field that updates), written in this computer's language and format.

import { Extension, type Editor } from '@tiptap/core'

export interface DateFormat {
  id: string
  label: string
  text: string
}

/** The ways a date/time can be inserted, as they'd look right now. */
export function dateFormats(now = new Date(), locale?: string): DateFormat[] {
  // (newer ICU puts a narrow no-break space before AM/PM; a plain space reads the same in any editor)
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, o).format(now).replace(/[\u202f\u00a0]/g, ' ')
  const p2 = (n: number) => String(n).padStart(2, '0')
  const long = f({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const time = f({ hour: 'numeric', minute: '2-digit' })
  return [
    { id: 'long', label: 'Date', text: long },
    { id: 'medium', label: 'Date (short)', text: f({ year: 'numeric', month: 'short', day: 'numeric' }) },
    { id: 'numeric', label: 'Date (numbers)', text: f({ year: 'numeric', month: '2-digit', day: '2-digit' }) },
    { id: 'iso', label: 'Date (year first)', text: `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}` },
    { id: 'time', label: 'Time', text: time },
    { id: 'both', label: 'Date and time', text: `${long}, ${time}` }
  ]
}

export function insertDate(editor: Editor, id: string): boolean {
  const fmt = dateFormats().find((d) => d.id === id)
  if (!fmt || !editor.isEditable) return false
  return editor.chain().focus().insertContent(fmt.text).run()
}

export const DateTime = Extension.create({
  name: 'dateTime',
  addKeyboardShortcuts() {
    return {
      'Alt-Shift-d': () => insertDate(this.editor, 'long'),
      'Alt-Shift-t': () => insertDate(this.editor, 'time')
    }
  }
})
