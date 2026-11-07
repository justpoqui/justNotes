import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Excalidraw falls back to downloading its fonts from esm.sh, and Chromium
 * requests that fallback even when the bundled copy loads. Point the fallback
 * at the bundled fonts too, so the app never reaches out to the internet.
 */
function excalidrawOffline(): Plugin {
  return {
    name: 'excalidraw-offline',
    transform(code, id) {
      if (!id.includes('@excalidraw') || !code.includes('ASSETS_FALLBACK_URL')) return null
      const out = code.replace(/`https:\/\/esm\.sh\/[\s\S]*?\/dist\/prod\/`/g, 'window.EXCALIDRAW_ASSET_PATH')
      if (out === code) this.warn('Could not remove the Excalidraw CDN fallback; fonts may be requested online.')
      return { code: out, map: null }
    }
  }
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
    plugins: [react(), excalidrawOffline()],
    // The English spell-check dictionary is bundled into the app (no downloads).
    resolve: { alias: { '@dictionary-en': resolve(__dirname, 'node_modules/dictionary-en'), '@dictionary-en-gb': resolve(__dirname, 'node_modules/dictionary-en-gb') } }
  }
})
