// App settings (Settings window). Stored in this computer's app data and
// shared through a tiny store so the editor picks up changes immediately.

import { useSyncExternalStore } from 'react'
import { load, save } from './storage'

export interface Replacement {
  from: string
  to: string
}

export interface Settings {
  /** Red underline under misspelled words. */
  spellcheck: boolean
  /** Fix common typos (and your own replacements) as you type. */
  autocorrect: boolean
  /** Also fix a misspelling that is one letter off from exactly one word. */
  fixNearMisses: boolean
  /** Capitalize the first letter of a sentence. */
  capitalizeSentences: boolean
  /** (c) → ©, -- → –, -> → →, ... → …, 1/2 → ½ */
  autoformat: boolean
  /** "straight" → “curly” quotes. */
  smartQuotes: boolean
  /** Your own AutoCorrect entries. */
  replacements: Replacement[]
  /** Words added with "Add to dictionary". */
  dictionary: string[]
  /** Words chosen "Ignore" for (or whose automatic correction was undone). */
  ignoredWords: string[]
  /** Show the word / character count in the status bar. */
  wordCount: boolean
  /** Default font for page text ('' = the app's standard font). */
  editorFont: string
  /** Default text size of pages, in px. */
  editorFontSize: number
  /** How long after you stop typing a page is saved, in ms. */
  autosaveDelay: number
  /** Zoom of the page area (status bar slider, Ctrl+= / Ctrl+-), 1 = 100%. */
  pageZoom: number
  /** Size of the whole app (Settings → General), 1 = 100%. */
  appZoom: number
  /** Spell-check dictionary. */
  spellLanguage: 'en-US' | 'en-GB'
  /** Page text column: normal (easy reading) or wide. */
  pageWidth: 'normal' | 'wide'
  /** Automatic backups of every notebook. */
  autoBackup: 'off' | 'daily' | 'weekly'
  /** Folder for automatic backups ('' = ~/Documents/justNotes Backups). */
  backupFolder: string
  /** How many backups (days) to keep. */
  backupKeep: number
  /** When the last automatic backup was made (ISO time, '' = never). */
  lastBackup: string
}

export const DEFAULT_SETTINGS: Settings = {
  spellcheck: true,
  autocorrect: true,
  fixNearMisses: true,
  capitalizeSentences: false,
  autoformat: true,
  smartQuotes: true,
  replacements: [],
  dictionary: [],
  ignoredWords: [],
  wordCount: true,
  editorFont: '',
  editorFontSize: 16,
  autosaveDelay: 600,
  pageZoom: 1,
  appZoom: 1,
  spellLanguage: 'en-US',
  pageWidth: 'normal',
  autoBackup: 'daily',
  backupFolder: '',
  backupKeep: 10,
  lastBackup: ''
}

let current: Settings = { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('jn.settings', {}) }
const listeners = new Set<() => void>()

export const getSettings = (): Settings => current

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch }
  save('jn.settings', current)
  listeners.forEach((l) => l())
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings)
}
