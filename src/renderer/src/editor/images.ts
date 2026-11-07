// Image helpers for the editor: resolving Markdown image paths to URLs the
// window can display, and saving pasted/dropped images into assets/.

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/avif': '.avif'
}

/**
 * "assets/a b.png" in Work/Meetings → "wiki-file://notes/Work/Meetings/assets/a%20b.png".
 * URLs with a scheme (data:, https:, wiki-file:) are left as they are.
 */
export function resolveImageSrc(notebook: string, section: string, src: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(src)) return src
  let rel = src.replace(/^\.\//, '')
  try {
    rel = decodeURI(rel)
  } catch {
    /* keep as-is */
  }
  return 'wiki-file://notes/' + [notebook, section, ...rel.split('/')].map(encodeURIComponent).join('/')
}

export const isImageFile = (f: File) => f.type in MIME_EXT

function nameFor(file: File): string {
  const ext = MIME_EXT[file.type] ?? '.png'
  // Clipboard screenshots arrive as "image.png" — give them a useful, unique-ish name.
  if (!file.name || /^image\.\w+$/i.test(file.name)) {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `pasted-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${ext}`
  }
  return /\.[a-z\d]+$/i.test(file.name) ? file.name : file.name + ext
}

/** Saves an image file into the section's assets/ folder; resolves to its Markdown path. */
export async function storeImage(notebook: string, section: string, file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const r = await window.wiki.saveAsset(notebook, section, nameFor(file), data)
  if (!r.ok) throw new Error(r.error.message)
  return r.data
}
