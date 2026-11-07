// Copies Excalidraw's fonts into the renderer's public folder so the
// whiteboard works fully offline (by default Excalidraw loads them from a CDN).
// Runs automatically before `npm run dev`, `build` and `start`.

import { cpSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts')
const to = join(root, 'src/renderer/public/excalidraw/fonts')

if (!existsSync(from)) {
  console.error('Excalidraw fonts not found. Run `npm install` first.')
  process.exit(1)
}
if (!existsSync(to)) {
  cpSync(from, to, { recursive: true })
  console.log('Copied Excalidraw fonts for offline use.')
}
