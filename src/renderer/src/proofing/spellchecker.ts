// The bundled English (US or UK) dictionaries, loaded on first use. Fully offline.

import nspell from 'nspell'
import affUS from '@dictionary-en/index.aff?raw'
import dicUS from '@dictionary-en/index.dic?raw'
import affGB from '@dictionary-en-gb/index.aff?raw'
import dicGB from '@dictionary-en-gb/index.dic?raw'
import { getSettings, subscribeSettings } from '../lib/settings'
import type { SpellChecker } from './rules'

let instance: ReturnType<typeof nspell> | null = null
let instanceLang = ''
let added = new Set<string>()

/** Words the user added. Synced from settings so add/remove takes effect at once. */
function syncPersonal(): void {
  if (!instance) return
  const words = new Set(getSettings().dictionary)
  for (const w of added) if (!words.has(w)) instance.remove(w)
  for (const w of words) if (!added.has(w)) instance.add(w)
  added = words
}

let subscribed = false
export function getSpellChecker(): SpellChecker {
  const lang = getSettings().spellLanguage
  if (!instance || instanceLang !== lang) {
    instance = lang === 'en-GB' ? nspell(affGB, dicGB) : nspell(affUS, dicUS)
    instanceLang = lang
    added = new Set()
    // Words used by the app itself (its name, key names) shouldn't be underlined.
    for (const w of BUILT_IN_WORDS) instance.add(w)
    syncPersonal()
    if (!subscribed) {
      subscribed = true
      subscribeSettings(syncPersonal)
    }
  }
  return instance
}

const BUILT_IN_WORDS = ['justNotes', 'Ctrl', 'Alt', 'Esc', 'Markdown', 'Excalidraw', 'whiteboard', 'whiteboards']

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
