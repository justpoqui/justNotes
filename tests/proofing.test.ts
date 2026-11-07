// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { autocorrectWord, autoformat, matchCase, oneEdit, smartQuote, startsSentence } from '../src/renderer/src/proofing/rules'
import { getSpellChecker, isMisspelled } from '../src/renderer/src/proofing/spellchecker'

const opts = (over = {}) => ({ replacements: [], fixNearMisses: true, checker: getSpellChecker(), ignore: new Set<string>(), ...over })

describe('autocorrect', () => {
  it('fixes common typos, keeping capitalisation', () => {
    expect(autocorrectWord('teh', opts())).toBe('the')
    expect(autocorrectWord('Teh', opts())).toBe('The')
    expect(autocorrectWord('recieve', opts())).toBe('receive')
    expect(autocorrectWord('dont', opts())).toBe("don't")
    expect(autocorrectWord('i', opts())).toBe('I')
    expect(autocorrectWord('im', opts())).toBe("I'm")
  })
  it('leaves real words, names and risky contractions alone', () => {
    for (const w of ['form', 'cat', 'the', 'ill', 'lets', 'cant', 'Mardar', 'NASA', 'x1y2']) expect(autocorrectWord(w, opts())).toBeNull()
  })
  it('fixes a near miss only when there is one clear answer', () => {
    expect(autocorrectWord('definitly', opts())).toBe('definitely') // one letter missing, one candidate
    expect(autocorrectWord('wierd', opts({ replacements: [] }))).toBe('weird') // (from the typo list)
    expect(autocorrectWord('wirds', opts())).toBeNull() // several words one letter away
    expect(autocorrectWord('definitly', opts({ fixNearMisses: false }))).toBeNull()
  })
  it('uses your own replacements first and respects ignored words', () => {
    expect(autocorrectWord('jn', opts({ replacements: [{ from: 'jn', to: 'justNotes' }] }))).toBe('justNotes')
    expect(autocorrectWord('teh', opts({ ignore: new Set(['teh']) }))).toBeNull()
  })
})

describe('autoformat', () => {
  it.each([
    ['(c)', '©'], ['(tm)', '™'], ['word --', '–'], ['word--', '—'], ['a ->', '→'], ['<-', '←'], ['wait...', '…'], ['1/2', '½'], ['x !=', '≠']
  ])('%s → %s', (before, out) => expect(autoformat(before)?.replace).toBe(out))
  it('does not touch dividers, dates or longer fractions', () => {
    expect(autoformat('--')).toBeNull() // start of a line ("---" makes a divider)
    expect(autoformat('11/2')).toBeNull()
    expect(autoformat('2024/1/2')).toBeNull()
  })
  it('picks the right curly quote', () => {
    expect(smartQuote('"', undefined)).toBe('“')
    expect(smartQuote('"', 'd')).toBe('”')
    expect(smartQuote("'", 'n')).toBe('’')
    expect(smartQuote("'", ' ')).toBe('‘')
  })
})

describe('helpers', () => {
  it('matchCase / oneEdit / startsSentence', () => {
    expect(matchCase('the', 'TEH')).toBe('THE')
    expect(oneEdit('teh', 'the')).toBe('swap')
    expect(oneEdit('cat', 'cart')).toBe('insert')
    expect(oneEdit('cat', 'dog')).toBeNull()
    expect(startsSentence('Hello. ')).toBe(true)
    expect(startsSentence('Hello ')).toBe(false)
    expect(startsSentence('')).toBe(true)
  })
  it('spell-checks with the bundled dictionary', () => {
    expect(isMisspelled('receive')).toBe(false)
    expect(isMisspelled('recieve')).toBe(true)
    expect(isMisspelled('PDF')).toBe(false)
    expect(isMisspelled("don't")).toBe(false)
    expect(isMisspelled('don’t')).toBe(false)
  })
})
