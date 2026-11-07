import { describe, expect, it } from 'vitest'
import { dateFormats } from '../src/renderer/src/editor/dateTime'

describe('insert date / time', () => {
  it('offers the usual formats', () => {
    const d = Object.fromEntries(dateFormats(new Date(2026, 10, 6, 15, 4), 'en-US').map((f) => [f.id, f.text]))
    expect(d.long).toBe('Friday, November 6, 2026')
    expect(d.medium).toBe('Nov 6, 2026')
    expect(d.numeric).toBe('11/06/2026')
    expect(d.iso).toBe('2026-11-06')
    expect(d.time).toBe('3:04 PM')
    expect(d.both).toBe('Friday, November 6, 2026, 3:04 PM')
  })
})
