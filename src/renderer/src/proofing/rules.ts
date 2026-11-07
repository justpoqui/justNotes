// Pure AutoCorrect / AutoFormat logic (no editor code), so it can be unit-tested.

import { COMMON_TYPOS, RISKY_TYPOS } from './typos'

export interface SpellChecker {
  correct(word: string): boolean
  suggest(word: string): string[]
}

/** Gives `word` the same capitalisation pattern as `like` ("Teh" → "The", "TEH" → "THE"). */
export function matchCase(word: string, like: string): string {
  if (like.length > 1 && like === like.toUpperCase() && like !== like.toLowerCase()) return word.toUpperCase()
  if (like[0] && like[0] === like[0].toUpperCase() && like[0] !== like[0].toLowerCase()) return word[0].toUpperCase() + word.slice(1)
  return word
}

/** How a misspelling differs from a candidate, if it is exactly one edit away. */
export function oneEdit(a: string, b: string): 'swap' | 'change' | 'insert' | 'delete' | null {
  if (a === b) return null
  if (a.length === b.length) {
    const diff: number[] = []
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i)
    if (diff.length === 1) return 'change'
    if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return 'swap'
    return null
  }
  const [long, short, kind] = a.length > b.length ? [a, b, 'delete' as const] : [b, a, 'insert' as const]
  if (long.length - short.length !== 1) return null
  for (let i = 0; i < long.length; i++) if (long.slice(0, i) + long.slice(i + 1) === short) return kind
  return null
}

export interface CorrectionOptions {
  replacements: { from: string; to: string }[]
  fixNearMisses: boolean
  checker: SpellChecker | null
  /** Words the user added to the dictionary or reverted earlier. */
  ignore: Set<string>
}

/**
 * The correction for a just-typed word, or null to leave it alone.
 * Order: your own replacements → built-in typo list → a careful near-miss fix.
 */
export function autocorrectWord(word: string, opts: CorrectionOptions): string | null {
  if (!word || opts.ignore.has(word.toLowerCase())) return null
  const own = opts.replacements.find((r) => r.from && r.from === word) ?? opts.replacements.find((r) => r.from && r.from.toLowerCase() === word.toLowerCase())
  if (own) return own.to === word ? null : own.from === word ? own.to : matchCase(own.to, word)

  const lower = word.toLowerCase()
  if (Object.prototype.hasOwnProperty.call(COMMON_TYPOS, lower) && !RISKY_TYPOS.has(lower)) {
    const fixed = COMMON_TYPOS[lower]
    // "i" → "I" regardless of case; others follow the typed capitalisation.
    return lower === 'i' || fixed.startsWith('I') ? (word === fixed ? null : fixed) : matchCase(fixed, word)
  }

  // Near misses: only lower-case or Capitalized words of 4+ letters (not names in ALL CAPS,
  // not words with digits), only if misspelled, and only if exactly one word is a single
  // edit away — or, failing that, exactly one is a swap of two neighbouring letters.
  const c = opts.checker
  if (!opts.fixNearMisses || !c || word.length < 4 || !/^[A-Za-z]+$/.test(word) || /^[A-Z]{2,}/.test(word)) return null
  if (c.correct(word) || c.correct(lower)) return null
  const close = c
    .suggest(lower)
    .filter((s) => /^[a-z]+$/.test(s))
    .map((s) => ({ s, kind: oneEdit(lower, s) }))
    .filter((x) => x.kind)
  const pick = close.length === 1 ? close : close.filter((x) => x.kind === 'swap')
  return pick.length === 1 ? matchCase(pick[0].s, word) : null
}

/** AutoFormat: text before the cursor that changes when a space/punctuation is typed after it. */
export const AUTOFORMAT_RULES: { find: RegExp; replace: string }[] = [
  { find: /\(c\)$/i, replace: '©' },
  { find: /\(r\)$/i, replace: '®' },
  { find: /\(tm\)$/i, replace: '™' },
  { find: /(?<=\s)--$/, replace: '–' }, // " -- " → " – " (not at the start of a line: that's for dividers)
  { find: /(?<=\S)--$/, replace: '—' }, // "word--" → "word—"
  { find: /<->$/, replace: '↔' },
  { find: /->$/, replace: '→' },
  { find: /<-$/, replace: '←' },
  { find: /=>$/, replace: '⇒' },
  { find: /\.\.\.$/, replace: '…' },
  { find: /(?<![\d/])1\/2$/, replace: '½' },
  { find: /(?<![\d/])1\/4$/, replace: '¼' },
  { find: /(?<![\d/])3\/4$/, replace: '¾' },
  { find: /!=$/, replace: '≠' },
  { find: /\+-$/, replace: '±' }
]

/** The AutoFormat change for the text just before the cursor, if any. */
export function autoformat(before: string): { length: number; replace: string } | null {
  for (const r of AUTOFORMAT_RULES) {
    const m = r.find.exec(before)
    if (m) return { length: m[0].length, replace: r.replace }
  }
  return null
}

/** Curly quote for a straight one, decided by the character before it. */
export function smartQuote(quote: '"' | "'", prevChar: string | undefined): string {
  const opening = prevChar === undefined || /[\s([{—–-]/.test(prevChar)
  if (quote === '"') return opening ? '“' : '”'
  return opening ? '‘' : '’' // also the apostrophe in "don’t"
}

/** True if the text before a word ends a sentence (so the word should start with a capital). */
export function startsSentence(textBefore: string): boolean {
  const t = textBefore.replace(/[\s"'“‘(]+$/, '')
  return t === '' || /[.!?]$/.test(t)
}
