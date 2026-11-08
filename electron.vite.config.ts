import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
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

/**
 * Writes THIRD-PARTY-NOTICES.txt next to the app's page: the license of every package that
 * ends up in the window's code (found from the build itself, so the list is always complete),
 * of the app's own runtime packages, and of the whiteboard fonts and spelling dictionaries.
 * Shown in File > About, and shipped with the installers.
 */
function thirdPartyNotices(): Plugin {
  const root = __dirname
  const nm = join(root, 'node_modules') + sep
  const MIT = 'MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.'
  /** The package folder a file belongs to (handles @scope/name and nested node_modules). */
  const packageDir = (file: string): string | null => {
    const i = file.lastIndexOf(sep + 'node_modules' + sep)
    if (i < 0) return null
    const rest = file.slice(i + 14).split(sep)
    const parts = rest[0].startsWith('@') ? rest.slice(0, 2) : rest.slice(0, 1)
    return join(file.slice(0, i + 14), ...parts)
  }
  const licenseText = (dir: string): string | null => {
    const f = readdirSync(dir).find((n) => /^(licen[cs]e|copying)([.-](md|txt|markdown|mit))?$/i.test(n))
    return f ? readFileSync(join(dir, f), 'utf8').trim() : null
  }
  const describe = (dir: string) => {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    // ("licenses": [{ type }] is the older way of writing it)
    const license = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((l: { type?: string }) => l.type).join(' OR ') : 'see the package'))
    const repo = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? pkg.homepage ?? '')
    const author = typeof pkg.author === 'string' ? pkg.author : (pkg.author?.name ?? '')
    return { key: `${pkg.name}@${pkg.version}`, name: pkg.name as string, version: pkg.version as string, license, repo, author, text: licenseText(dir) }
  }
  /** The app's runtime packages (main process) and everything they depend on. */
  const runtimeDirs = (): string[] => {
    const seen = new Set<string>()
    const visit = (name: string, from: string) => {
      let d = from
      for (;;) {
        const cand = join(d, 'node_modules', name)
        if (existsSync(join(cand, 'package.json'))) {
          if (seen.has(cand)) return
          seen.add(cand)
          const pkg = JSON.parse(readFileSync(join(cand, 'package.json'), 'utf8'))
          for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, cand)
          return
        }
        if (d === root || dirname(d) === d) return
        d = dirname(d)
      }
    }
    for (const dep of Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies ?? {})) visit(dep, root)
    return [...seen]
  }
  return {
    name: 'third-party-notices',
    apply: 'build',
    generateBundle() {
      const dirs = new Set<string>()
      for (const id of this.getModuleIds()) {
        const file = id.replace(/^\0/, '').split('?')[0]
        if (!file.startsWith(nm) && !file.includes(sep + 'node_modules' + sep)) continue
        const d = packageDir(file)
        if (d && existsSync(join(d, 'package.json'))) dirs.add(d)
      }
      for (const d of runtimeDirs()) dirs.add(d)
      const pkgs = new Map<string, ReturnType<typeof describe>>()
      for (const d of dirs) {
        try {
          const p = describe(d)
          if (!pkgs.has(p.key)) pkgs.set(p.key, p)
        } catch {
          /* not a real package folder */
        }
      }
      const list = [...pkgs.values()].sort((a, b) => a.name.localeCompare(b.name))
      const line = '='.repeat(78)
      const out: string[] = [
        'THIRD-PARTY SOFTWARE IN justNotes',
        '',
        'justNotes is Copyright (c) 2026 justpoqui. All rights reserved (see LICENSE).',
        'It includes the following software, fonts and dictionaries made by others. Each stays',
        'under its own license, reproduced below. Electron and Chromium, which run the app, come',
        'with their own notices in the app folder (LICENSE.electron.txt, LICENSES.chromium.html).',
        '',
        'Packages:',
        ...list.map((p) => `  - ${p.name} ${p.version} (${p.license})`),
        '  - Whiteboard fonts (SIL Open Font License 1.1 / MIT), see the end of this file',
        ''
      ]
      for (const p of list) {
        out.push(line, `${p.name} ${p.version}`, `License: ${p.license}`)
        if (p.author) out.push(`Author: ${p.author}`)
        if (p.repo) out.push(`Source: ${p.repo.replace(/^git\+/, '')}`)
        // Packages without a license file of their own: their license's standard text (MIT asks for it).
        const holder = p.author || (p.name.startsWith('@radix-ui/') ? 'WorkOS' : p.name.startsWith('@excalidraw/') ? 'Excalidraw' : `the ${p.name} authors`)
        const fallback = /^\(?MIT\)?$/.test(p.license) ? `Copyright (c) ${holder}\n\n${MIT}` : `(This package doesn't include a separate license file; it is published under the ${p.license} license.)`
        out.push('', p.text ?? fallback, '')
      }
      out.push(line, readFileSync(join(root, 'build/licenses/fonts.txt'), 'utf8').trim(), '', readFileSync(join(root, 'build/licenses/OFL-1.1.txt'), 'utf8').trim(), '', 'Comic Shanns: Copyright (c) 2018 Shannon Miwa.', '', MIT, '')
      this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-NOTICES.txt', source: out.join('\n') })
    }
  }
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
    plugins: [react(), excalidrawOffline(), thirdPartyNotices()],
    // The English spell-check dictionary is bundled into the app (no downloads).
    resolve: { alias: { '@dictionary-en': resolve(__dirname, 'node_modules/dictionary-en'), '@dictionary-en-gb': resolve(__dirname, 'node_modules/dictionary-en-gb') } }
  }
})
