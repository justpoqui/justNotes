import type { WikiApi } from '../shared/types'

declare global {
  interface Window {
    wiki: WikiApi
  }
}

export {}
