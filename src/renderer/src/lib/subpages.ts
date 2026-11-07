// Subpages (OneNote-style): a page can sit under the page above it, up to two levels deep.
// A page and the subpages under it move, fold and get indented together.

export const MAX_LEVEL = 2

export interface LeveledPage {
  name: string
  level: number
}

/** Index just past the page at `i` and its subpages. */
export function blockEnd(pages: LeveledPage[], i: number): number {
  let j = i + 1
  while (j < pages.length && pages[j].level > pages[i].level) j++
  return j
}

export const hasSubpages = (pages: LeveledPage[], i: number) => blockEnd(pages, i) > i + 1

/** The names in order after moving `name` (with its subpages) to just before `before` (null = to the end). */
export function moveBlock(pages: LeveledPage[], name: string, before: string | null): string[] {
  const i = pages.findIndex((p) => p.name === name)
  const names = pages.map((p) => p.name)
  if (i < 0) return names
  const end = blockEnd(pages, i)
  const block = names.slice(i, end)
  if (before !== null && block.includes(before)) return names // dropped onto itself
  const rest = [...names.slice(0, i), ...names.slice(end)]
  const at = before === null ? rest.length : rest.indexOf(before)
  rest.splice(at < 0 ? rest.length : at, 0, ...block)
  return rest
}

/**
 * Moves a page (with its subpages) one place up or down among its neighbours (Alt+↑ / Alt+↓):
 * past the whole previous / next block, so it never lands inside another page's subpages.
 */
export function stepBlock(pages: LeveledPage[], name: string, dir: -1 | 1): string[] | null {
  const i = pages.findIndex((p) => p.name === name)
  if (i < 0) return null
  const level = pages[i].level
  if (dir < 0) {
    // the start of the previous sibling block (a page at the same or a higher level)
    let j = i - 1
    while (j >= 0 && pages[j].level > level) j--
    if (j < 0) return null
    return moveBlock(pages, name, pages[j].name)
  }
  const end = blockEnd(pages, i)
  if (end >= pages.length) return null
  const nextEnd = blockEnd(pages, end)
  return moveBlock(pages, name, pages[nextEnd]?.name ?? null)
}

/**
 * The section's levels after making `name` one level deeper (+1) or shallower (-1); its own
 * subpages move with it. Null when that isn't possible (e.g. the first page can't be a subpage).
 */
export function shiftLevel(pages: LeveledPage[], name: string, delta: 1 | -1): Record<string, number> | null {
  const i = pages.findIndex((p) => p.name === name)
  if (i < 0) return null
  const end = blockEnd(pages, i)
  const target = pages[i].level + delta
  const maxHere = i === 0 ? 0 : pages[i - 1].level + 1
  if (target < 0 || target > Math.min(maxHere, MAX_LEVEL)) return null
  // Its subpages keep their place under it (as far as the depth limit allows).
  const levels = Object.fromEntries(pages.map((p) => [p.name, p.level]))
  for (let k = i; k < end; k++) levels[pages[k].name] = Math.max(0, Math.min(MAX_LEVEL, pages[k].level + delta))
  levels[name] = target
  return levels
}

/** The pages to show: the subpages of folded pages are hidden. */
export function visiblePages<T extends LeveledPage & { key: string }>(pages: T[], folded: Set<string>): T[] {
  const out: T[] = []
  let hideBelow = Infinity // hide pages deeper than this level
  for (const p of pages) {
    if (p.level > hideBelow) continue
    hideBelow = Infinity
    out.push(p)
    if (folded.has(p.key)) hideBelow = p.level
  }
  return out
}

/** Keys of the pages above `index` that hold it (its parent, grandparent). */
export function ancestorsOf<T extends LeveledPage & { key: string }>(pages: T[], index: number): string[] {
  const out: string[] = []
  let level = pages[index]?.level ?? 0
  for (let k = index - 1; k >= 0 && level > 0; k--) {
    if (pages[k].level < level) {
      out.push(pages[k].key)
      level = pages[k].level
    }
  }
  return out
}
