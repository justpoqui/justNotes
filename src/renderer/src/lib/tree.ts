// Helpers for addressing tree items by a string key.
// Key = names joined with "/" ("Work", "Work/Meetings", "Work/Meetings/Standup").
// "/" can never appear in a file or folder name, so keys are unambiguous.

import type { ItemRef, Tree } from '../../../shared/types'

export type Kind = 'notebook' | 'section' | 'page'

export const keyOf = (ref: ItemRef): string =>
  [ref.notebook, ref.section, ref.page].filter((p) => p !== undefined).join('/')

export function refOf(key: string): ItemRef {
  const [notebook, section, page] = key.split('/')
  return { notebook, section, page }
}

export function kindOf(key: string): Kind {
  const n = key.split('/').length
  return n === 1 ? 'notebook' : n === 2 ? 'section' : 'page'
}

export function parentOf(key: string): string | null {
  const i = key.lastIndexOf('/')
  return i < 0 ? null : key.slice(0, i)
}

export const nameOf = (key: string): string => key.slice(key.lastIndexOf('/') + 1)

/** If `key` is `from` or lives inside it, rewrite that prefix to `to`. */
export function remapKey(key: string, from: string, to: string): string {
  if (key === from) return to
  if (key.startsWith(from + '/')) return to + key.slice(from.length)
  return key
}

/** True if `key` is `ancestor` or inside it. */
export const isWithin = (key: string, ancestor: string): boolean => key === ancestor || key.startsWith(ancestor + '/')

/** Does this key point at something that currently exists in the tree? */
export function existsIn(tree: Tree, key: string): boolean {
  const { notebook, section, page } = refOf(key)
  const nb = tree.notebooks.find((n) => n.name === notebook)
  if (!nb) return false
  if (section === undefined) return true
  const sec = nb.sections.find((s) => s.name === section)
  if (!sec) return false
  if (page === undefined) return true
  return sec.pages.some((p) => p.name === page)
}

/** The deepest part of `key` that still exists (or null). */
export function nearestExisting(tree: Tree, key: string): string | null {
  for (let k: string | null = key; k !== null; k = parentOf(k)) if (existsIn(tree, k)) return k
  return null
}
