// Matching for Quick open (Ctrl+P): find pages and sections by typing part of their name.

import type { Tree } from '../../../shared/types'

export interface QuickItem {
  /** "Notebook/Section/Page" or "Notebook/Section". */
  key: string
  kind: 'page' | 'section'
  name: string
  /** Where it is, e.g. "Work › Meetings". */
  where: string
}

export interface QuickMatch extends QuickItem {
  score: number
  /** Indexes of the matched letters in `name` (for highlighting). */
  hits: number[]
}

/** Every page and section of every notebook, in tree order. */
export function quickItems(tree: Tree): QuickItem[] {
  const out: QuickItem[] = []
  for (const nb of tree.notebooks) {
    for (const sec of nb.sections) {
      out.push({ key: `${nb.name}/${sec.name}`, kind: 'section', name: sec.name, where: nb.name })
      for (const p of sec.pages) out.push({ key: `${nb.name}/${sec.name}/${p.name}`, kind: 'page', name: p.name, where: `${nb.name} › ${sec.name}` })
    }
  }
  return out
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const isWordStart = (name: string, i: number) => i === 0 || /[\s\-_.()[\]/]/.test(name[i - 1]) || (/\p{Lu}/u.test(name[i]) && /\p{Ll}/u.test(name[i - 1]))

/**
 * How well `query` matches `name` (higher is better), or null for no match.
 * Every word of the query must appear, in order, as a run of letters, or the letters of the word in
 * order ("mtg" finds "Meeting"). Whole-word and start-of-name matches rank first.
 */
export function matchName(name: string, query: string): { score: number; hits: number[] } | null {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return { score: 0, hits: [] }
  const hay = fold(name)
  // fold() can change lengths for a few characters; then highlight nothing rather than the wrong letters.
  const sameLength = hay.length === name.length
  let score = 0
  let from = 0
  const hits: number[] = []
  for (const w of words) {
    // 1) the word as one run of letters (prefer a run at the start of a word)
    let at = -1
    for (let i = hay.indexOf(w, from); i >= 0; i = hay.indexOf(w, i + 1)) {
      if (at < 0) at = i
      if (isWordStart(name, i)) {
        at = i
        break
      }
    }
    if (at >= 0) {
      score += 10 * w.length + (isWordStart(name, at) ? 15 : 0) + (at === 0 ? 10 : 0)
      for (let i = 0; i < w.length; i++) hits.push(at + i)
      from = at + w.length
      continue
    }
    // 2) the letters in order, anywhere after the previous word
    let i = from
    let gaps = 0
    let last = -1
    for (const ch of w) {
      const j = hay.indexOf(ch, i)
      if (j < 0) return null
      if (last >= 0 && j > last + 1) gaps++
      hits.push(j)
      last = j
      i = j + 1
    }
    score += 3 * w.length - 2 * gaps + (isWordStart(name, hits[hits.length - w.length]) ? 5 : 0)
    from = i
  }
  // Shorter names win ties: "Plan" before "Planning notes" for "plan".
  score -= Math.min(10, name.length / 8)
  if (fold(query).trim() === hay) score += 50
  return { score, hits: sameLength ? hits : [] }
}

/** The best matches for `query`, best first. Pages rank a little above sections. */
export function quickSearch(items: QuickItem[], query: string, limit = 50): QuickMatch[] {
  const out: QuickMatch[] = []
  const multiWord = query.trim().split(/\s+/).length > 1
  for (const item of items) {
    const m = matchName(item.name, query)
    // With two or more words, the notebook / section name can narrow it down too ("home standup").
    const full = m || !multiWord ? null : matchName(`${item.where} › ${item.name}`.replace(/ › /g, ' '), query)
    if (m) out.push({ ...item, score: m.score + (item.kind === 'page' ? 2 : 0), hits: m.hits })
    else if (full) out.push({ ...item, score: full.score - 20, hits: [] })
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit)
}
