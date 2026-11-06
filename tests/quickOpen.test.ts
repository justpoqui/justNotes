import { describe, expect, it } from 'vitest'
import { matchName, quickItems, quickSearch } from '../src/renderer/src/lib/quickOpen'
import type { Tree } from '../src/shared/types'

const page = (name: string) => ({ name, path: '', hasCanvas: false })
const tree: Tree = {
  root: '/n',
  notebooks: [
    {
      name: 'Work',
      path: '',
      sections: [
        { name: 'Meetings', path: '', pages: [page('Standup'), page('Planning notes'), page('Retro')] },
        { name: 'Ideas', path: '', pages: [page('Plan'), page('Café menu')] }
      ]
    },
    { name: 'Home', path: '', sections: [{ name: 'Garden', path: '', pages: [page('Standup bench')] }] }
  ]
}
const items = quickItems(tree)
const names = (q: string) => quickSearch(items, q).map((m) => m.name)

describe('quick open', () => {
  it('lists every page and section with where it is', () => {
    expect(items.filter((i) => i.kind === 'page')).toHaveLength(6)
    expect(items.find((i) => i.name === 'Retro')).toMatchObject({ key: 'Work/Meetings/Retro', where: 'Work › Meetings' })
  })
  it('finds by part of a name, best match first', () => {
    expect(names('plan').slice(0, 2)).toEqual(['Plan', 'Planning notes'])
    expect(names('standup')[0]).toBe('Standup')
    expect(names('retro')).toEqual(['Retro'])
  })
  it('matches letters in order, ignores case and accents', () => {
    expect(names('pln nts')[0]).toBe('Planning notes')
    expect(names('CAFE')).toEqual(['Café menu'])
    expect(names('xyz')).toEqual([])
  })
  it('can narrow down by notebook or section name', () => {
    expect(names('home standup')[0]).toBe('Standup bench')
    expect(names('garden')).toContain('Garden')
  })
  it("a single word only looks at names (not at the notebook or section it's in)", () => {
    expect(names('st')).toEqual(['Standup', 'Standup bench'])
  })
  it('reports which letters matched', () => {
    expect(matchName('Planning notes', 'notes')!.hits).toEqual([9, 10, 11, 12, 13])
  })
})
