// The wiki-file:// protocol lets the renderer display images stored inside
// the WikiBook folder (e.g. <img src="wiki-file://notes/Work/Meetings/assets/a.png">)
// without giving it general file access: only image files under the root are served.

import { net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FileEngine } from './fileEngine'

export const ASSET_SCHEME = 'wiki-file'
/** Serves files bundled with the app (the whiteboard's fonts) to the window. */
export const APP_ASSET_SCHEME = 'jn-asset'

/** Must run before the app is ready. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
    // corsEnabled: fonts are only loaded cross-origin when CORS allows it.
    { scheme: APP_ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

/**
 * jn-asset://excalidraw/fonts/... → <app>/out/renderer/excalidraw/fonts/...
 * (In the packaged page fonts can't be loaded from file:// because of CORS,
 * and Excalidraw would otherwise fall back to downloading them.)
 */
export function handleAppAssetProtocol(rendererDir: string): void {
  const base = path.join(rendererDir, 'excalidraw')
  protocol.handle(APP_ASSET_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.host !== 'excalidraw') throw new Error('unknown host')
      const rel = url.pathname.split('/').map(decodeURIComponent).join('/')
      const abs = path.resolve(base, '.' + rel)
      if (!abs.startsWith(base + path.sep)) throw new Error('outside')
      const res = await net.fetch(pathToFileURL(abs).toString())
      if (!res.ok) throw new Error('missing')
      const type = abs.endsWith('.woff2') ? 'font/woff2' : (res.headers.get('content-type') ?? 'application/octet-stream')
      return new Response(res.body, { headers: { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'max-age=31536000' } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
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
