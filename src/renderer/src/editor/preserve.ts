// Protects parts of a Markdown file the block editor can't represent.

/** YAML front-matter at the very top of the file ("---\n...\n---"). */
const FRONT_MATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

/**
 * Splits off front-matter so the editor never sees (or mangles) it.
 * Saving puts `frontMatter + body` back together unchanged.
 */
export function splitFrontMatter(md: string): { frontMatter: string; body: string } {
  const m = FRONT_MATTER.exec(md)
  if (!m) return { frontMatter: '', body: md }
  let frontMatter = m[0]
  if (!frontMatter.endsWith('\n')) frontMatter += '\n'
  // Keep one blank line between front-matter and the body when saving.
  const body = md.slice(m[0].length).replace(/^(\r?\n)+/, '')
  return { frontMatter: frontMatter + '\n', body }
}

/**
 * Things in the file that editing would simplify or drop. Code blocks and
 * inline code are ignored, since anything inside them is kept as-is.
 */
export function findUnsupported(md: string): string[] {
  const text = md
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '') // fenced code
    .replace(/^( {4}|\t).*$/gm, '') // indented code
    .replace(/`+[^`\n]*`+/g, '') // inline code
    // Tags the editor itself writes for text colour, font size and highlights.
    .replace(/<span style="(?:\s*(?:color|font-size):\s*[#\w\s.,()%-]+;?)+\s*">|<\/span>/gi, '')
    .replace(/<mark(?: style="\s*background-color:\s*[#\w\s.,()%-]+;?\s*")?>|<\/mark>/gi, '')
  const found: string[] = []
  if (/<\/?[a-z][a-z\d-]*(\s[^<>]*)?\/?>|<!--/i.test(text)) found.push('HTML tags')
  if (/\[\^[^\]\s]+\]/.test(text)) found.push('footnotes')
  if (/^\s*\[[^\]^]+\]:\s*\S/m.test(text)) found.push('reference-style links')
  return found
}
