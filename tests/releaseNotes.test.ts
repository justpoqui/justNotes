import { describe, expect, it } from 'vitest'
import { notesText } from '../src/main/releaseNotes'

describe('release notes in the Updates window', () => {
  it('keeps only "what\'s new", without formatting or the download instructions', () => {
    const md = "## What's new\n\n- **Faster** saving\n- Fixed `Ctrl+P`\n\n## Download\n\n### Windows PC\n1. Download the installer"
    expect(notesText(md)).toBe("What's new\n\n- Faster saving\n- Fixed Ctrl+P")
  })
  it('handles GitHub\'s HTML version too', () => {
    const html = '<h2>What&#39;s new</h2><ul><li><strong>Faster</strong> saving</li></ul><h2>Download</h2><p>Windows…</p>'
    expect(notesText(html)).toBe("What's new\n- Faster saving")
  })
  it('nothing useful → undefined', () => {
    expect(notesText('## Download\nfiles')).toBeUndefined()
    expect(notesText(null)).toBeUndefined()
  })
})
