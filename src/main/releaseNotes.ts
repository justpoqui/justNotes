// Release notes from GitHub, tidied for the app's Updates window.

/**
 * The release notes as plain text for the Updates window: only the "what's new" part (the
 * release page's download instructions are left out), without Markdown/HTML formatting.
 */
export function notesText(notes: unknown): string | undefined {
  let text = typeof notes === 'string' ? notes : Array.isArray(notes) ? notes.map((n) => (typeof n?.note === 'string' ? n.note : '')).join('\n\n') : ''
  text = text
    .replace(/<\/(p|h\d|li|ul|ol|div|table|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const cut = text.search(/^\s*(#+\s*)?Download\b/im)
  if (cut >= 0) text = text.slice(0, cut)
  text = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || undefined
}
