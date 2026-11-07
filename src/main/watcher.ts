// Watches the WikiBook folder so the UI refreshes when files are changed
// outside the app (file manager, another editor, sync tools...).

import { watch, type FSWatcher } from 'node:fs'

export function watchFolder(root: string, onChange: () => void, delayMs = 150): () => void {
  let timer: NodeJS.Timeout | undefined
  let watcher: FSWatcher | undefined
  let retry: NodeJS.Timeout | undefined

  const fire = () => {
    clearTimeout(timer)
    timer = setTimeout(onChange, delayMs)
  }

  const start = () => {
    try {
      // Recursive watching is supported on Linux since Node 20.
      watcher = watch(root, { recursive: true }, fire)
      watcher.on('error', () => {
        // e.g. the root folder itself was deleted; try again shortly.
        watcher?.close()
        watcher = undefined
        retry = setTimeout(start, 2000)
      })
    } catch {
      retry = setTimeout(start, 2000)
    }
  }

  start()
  return () => {
    clearTimeout(timer)
    clearTimeout(retry)
    watcher?.close()
  }
}
