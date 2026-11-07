// Runs the automatic backup when it's due (checked at start-up and every half hour).

import { flushAllSaves } from '../editor/saveCoordinator'
import { getSettings, updateSettings } from './settings'

const DAY = 24 * 60 * 60 * 1000

export function backupDue(now = Date.now()): boolean {
  const s = getSettings()
  if (s.autoBackup === 'off') return false
  const last = Date.parse(s.lastBackup)
  if (!Number.isFinite(last)) return true
  return now - last >= (s.autoBackup === 'weekly' ? 7 * DAY : DAY) - 5 * 60 * 1000 // (a little slack)
}

let running: Promise<string | null> | null = null

/** Backs up now. Resolves to an error message, or null when it worked. */
export function backupNow(): Promise<string | null> {
  running ??= (async () => {
    try {
      await flushAllSaves() // include what was just typed
      const s = getSettings()
      const r = await window.wiki.runAutoBackup(s.backupFolder, s.backupKeep)
      if (!r.ok) return r.error.message
      updateSettings({ lastBackup: new Date().toISOString() })
      return null
    } finally {
      running = null
    }
  })()
  return running
}

/** Starts the schedule; `onError` is told when a backup fails. Returns a stop function. */
export function startAutoBackup(onError: (message: string) => void): () => void {
  const check = () => {
    if (backupDue()) void backupNow().then((err) => err && onError(err))
  }
  const first = setTimeout(check, 15_000) // not during start-up
  const timer = setInterval(check, 30 * 60 * 1000)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
