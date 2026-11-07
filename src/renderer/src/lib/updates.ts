// The app's update state (from the main process), and the automatic checks.

import { useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/types'
import { flushAllSaves } from '../editor/saveCoordinator'
import { getSettings } from './settings'

let current: UpdateState = { status: 'idle', current: '' }
const listeners = new Set<(s: UpdateState) => void>()
let started = false

function start(): void {
  if (started) return
  started = true
  window.wiki.onUpdateState((s) => {
    current = s
    listeners.forEach((l) => l(s))
  })
  void window.wiki.getUpdateState().then((r) => {
    if (!r.ok) return
    current = r.data
    listeners.forEach((l) => l(r.data))
  })
  // Look for updates a little after start-up, then every 4 hours (unless turned off in Settings).
  const check = () => getSettings().checkUpdates && void window.wiki.checkForUpdates()
  setTimeout(check, 20_000)
  setInterval(check, 4 * 60 * 60 * 1000)
}

export function useUpdateState(): UpdateState {
  start()
  const [s, setS] = useState(current)
  useEffect(() => {
    listeners.add(setS)
    setS(current)
    return () => void listeners.delete(setS)
  }, [])
  return s
}

export const checkNow = () => window.wiki.checkForUpdates()

/** Saves every open page, then installs the update and restarts. */
export async function installNow(): Promise<void> {
  await flushAllSaves()
  await window.wiki.installUpdate()
}
