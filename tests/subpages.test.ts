import { describe, expect, it } from 'vitest'
import { ancestorsOf, moveBlock, shiftLevel, stepBlock, visiblePages } from '../src/renderer/src/lib/subpages'

// A        (0)
//   A1     (1)
//     A1x  (2)
//   A2     (1)
// B        (0)
// C        (0)
//   C1     (1)
const pages = [
  ['A', 0],
  ['A1', 1],
  ['A1x', 2],
  ['A2', 1],
  ['B', 0],
  ['C', 0],
  ['C1', 1]
].map(([name, level]) => ({ name: name as string, level: level as number, key: `n/s/${name}` }))

describe('subpages', () => {
  it('moves a page together with its subpages', () => {
    expect(moveBlock(pages, 'A', null)).toEqual(['B', 'C', 'C1', 'A', 'A1', 'A1x', 'A2'])
    expect(moveBlock(pages, 'A1', 'C')).toEqual(['A', 'A2', 'B', 'A1', 'A1x', 'C', 'C1'])
    expect(moveBlock(pages, 'A', 'A1x')).toEqual(pages.map((p) => p.name)) // into itself: no change
  })
  it('Alt+↑/↓ step over whole neighbouring blocks', () => {
    expect(stepBlock(pages, 'B', -1)).toEqual(['B', 'A', 'A1', 'A1x', 'A2', 'C', 'C1'])
    expect(stepBlock(pages, 'A', 1)).toEqual(['B', 'A', 'A1', 'A1x', 'A2', 'C', 'C1'])
    expect(stepBlock(pages, 'A2', -1)).toEqual(['A', 'A2', 'A1', 'A1x', 'B', 'C', 'C1'])
    expect(stepBlock(pages, 'A', -1)).toBeNull()
    expect(stepBlock(pages, 'C', 1)).toBeNull()
  })
  it('indents and outdents with the subpages following', () => {
    expect(shiftLevel(pages, 'B', 1)).toMatchObject({ B: 1 })
    expect(shiftLevel(pages, 'A', 1)).toBeNull() // the first page can't be a subpage
    expect(shiftLevel(pages, 'A1x', 1)).toBeNull() // two levels at most
    expect(shiftLevel(pages, 'A1', -1)).toMatchObject({ A1: 0, A1x: 1, A2: 1 })
    expect(shiftLevel(pages, 'C', 1)).toMatchObject({ C: 1, C1: 2 })
  })
  it('folding hides subpages; ancestors are found', () => {
    expect(visiblePages(pages, new Set(['n/s/A'])).map((p) => p.name)).toEqual(['A', 'B', 'C', 'C1'])
    expect(visiblePages(pages, new Set(['n/s/A1'])).map((p) => p.name)).toEqual(['A', 'A1', 'A2', 'B', 'C', 'C1'])
    expect(ancestorsOf(pages, 2)).toEqual(['n/s/A1', 'n/s/A'])
  })
})
