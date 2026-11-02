import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@dictionary-en': resolve(import.meta.dirname, 'node_modules/dictionary-en') } }
})
