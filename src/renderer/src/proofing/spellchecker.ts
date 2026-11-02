// The bundled English (US) dictionary, loaded on first use. Fully offline.

import nspell from 'nspell'
import aff from '@dictionary-en/index.aff?raw'
import dic from '@dictionary-en/index.dic?raw'
import { getSettings, subscribeSettings } from '../lib/settings'
import type { SpellChecker } from './rules'

let instance: ReturnType<typeof nspell> | null = null
let added = new Set<string>()

/** Words the user added. Synced from settings so add/remove takes effect at once. */
function syncPersonal(): void {
  if (!instance) return
  const words = new Set(getSettings().dictionary)
  for (const w of added) if (!words.has(w)) instance.remove(w)
  for (const w of words) if (!added.has(w)) instance.add(w)
  added = words
}

export function getSpellChecker(): SpellChecker {
  if (!instance) {
    instance = nspell(aff, dic)
    syncPersonal()
    subscribeSettings(syncPersonal)
  }
  return instance
}

const WORD = /^[\p{L}][\p{L}'’]*$/u

/** Whether a word should be underlined as misspelled. */
export function isMisspelled(word: string): boolean {
  if (word.length < 2 || !WORD.test(word)) return false
  if (/^[\p{Lu}]+$/u.test(word) && word.length <= 6) return false // acronyms like NASA, PDF
  const sp = getSpellChecker()
  const plain = word.replace(/’/g, "'").replace(/^'+|'+$/g, '')
  if (!plain) return false
  return !(sp.correct(plain) || sp.correct(plain.toLowerCase()))
}
