// The wiki-file:// protocol lets the renderer display images stored inside
// the WikiBook folder (e.g. <img src="wiki-file://notes/Work/Meetings/assets/a.png">)
// without giving it general file access: only image files under the root are served.

import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import type { FileEngine } from './fileEngine'

export const ASSET_SCHEME = 'wiki-file'

/** Must run before the app is ready. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

export function handleAssetProtocol(engine: FileEngine): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const rel = url.pathname.split('/').map(decodeURIComponent).join('/')
      return await net.fetch(pathToFileURL(engine.resolveAsset(rel)).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
