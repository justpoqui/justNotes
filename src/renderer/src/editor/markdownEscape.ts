// Escaping for plain text when saving to Markdown.
//
// TipTap's default escapes every * _ [ ] ~ ` \ and turns < > & into HTML
// entities, so "under_score" becomes "under\_score" and "<b>" becomes
// "&lt;b&gt;". That's safe but makes the files ugly to read outside the app.
// This version escapes a character only where Markdown could actually read
// it as formatting, so the file stays clean and still loads back exactly.

const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c)
const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c)
const ASCII_PUNCT = /[!-/:-@[-`{-~]/

export function escapeMarkdownText(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    // Text-node boundaries count as "unknown" (another node may follow), so be conservative there.
    const prev = text[i - 1]
    const next = text[i + 1]
    const spaced = isSpace(prev) && isSpace(next)
    let escape = false

    switch (c) {
      case '\\':
        escape = next === undefined || ASCII_PUNCT.test(next)
        break
      case '`':
        escape = true
        break
      case '*':
      case '~':
        // "5 * 3" can't start emphasis; "a*b" or "*word" could.
        escape = !spaced
        break
      case '_':
        // Intraword underscores ("snake_case") never start emphasis in CommonMark.
        escape = !spaced && !(isWordChar(prev) && isWordChar(next))
        break
      case '[':
        // "[[" would start a wiki link; "[^" a footnote.
        escape = next === '[' || next === '^'
        break
      case ']':
        // A link needs "](", "][" or "]:" — escaping the "]" is enough to prevent one.
        escape = next === undefined || next === '(' || next === '[' || next === ':'
        break
      case '<':
        // Could start an HTML tag, comment or <autolink>.
        escape = next !== undefined && /[A-Za-z/!?]/.test(next)
        break
      case '&':
        // Only when it looks like an entity, e.g. "&amp;" or "&#42;".
        escape = /^&(#\d+|#x[\da-f]+|[a-z][a-z\d]*);/i.test(text.slice(i))
        break
      case '|':
        // Would split a table cell. Rare outside tables, harmless to escape.
        escape = true
        break
    }
    out += escape ? '\\' + c : c
  }
  return out
}
