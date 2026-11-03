// The block editor for one page. Loads the page's Markdown, edits it with
// TipTap, and autosaves back to the same .md file.

import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { createPortal } from 'react-dom'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createExtensions, finishMarkdown } from '../editor/extensions'
import { isImageFile, resolveImageSrc, storeImage } from '../editor/images'
import { findUnsupported, splitFrontMatter } from '../editor/preserve'
import { clearActivePage, setActivePage } from '../editor/activePage'
import { registerFlusher } from '../editor/saveCoordinator'
import { Search } from '../editor/Search'
import { getSettings, updateSettings } from '../lib/settings'
import { ignoredWords, Proofing, refreshSpelling } from '../proofing/Proofing'
import { getSpellChecker } from '../proofing/spellchecker'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { FindBar } from './FindBar'
import { filterSlashItems, SlashCommand, slashItems, type SlashMenuState } from '../editor/SlashCommand'

const SAVE_DELAY_MS = 600

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

interface Props {
  notebook: string
  section: string
  page: string
  onError(message: string): void
  /** Element in the page bar where the save status is shown. */
  statusSlot?: HTMLElement | null
}

/** Loads the file, then mounts the editor with its contents. */
export function PageEditor(props: Props) {
  const { notebook, section, page } = props
  const [initial, setInitial] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.wiki.readPage(notebook, section, page).then((r) => {
      if (!alive) return
      if (r.ok) setInitial(r.data)
      else setError(r.error.message)
    })
    return () => {
      alive = false
    }
  }, [notebook, section, page])

  if (error) return <p className="error-text">{error}</p>
  if (initial === null) return null
  return <EditorView {...props} initial={initial} />
}

function EditorView({ notebook, section, page, initial, onError, statusSlot }: Props & { initial: string }) {
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [conflict, setConflict] = useState<string | null>(null)
  const [slash, setSlash] = useState<SlashMenuState | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [find, setFind] = useState<{ replace: boolean; token: number } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: (MenuItem | 'sep')[] } | null>(null)
  const findOpen = useRef(false)
  findOpen.current = find !== null
  const [stats, setStats] = useState<WordStats>({ words: 0, chars: 0, charsNoSpaces: 0, selWords: 0, selChars: 0 })
  const statsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scheduleStats = (ed: Editor) => {
    clearTimeout(statsTimer.current)
    statsTimer.current = setTimeout(() => !ed.isDestroyed && setStats(computeStats(ed)), 150)
  }
  const parts = useMemo(() => splitFrontMatter(initial), [initial])
  // Pages with content the editor would simplify open read-only until the user agrees.
  const [unsupported, setUnsupported] = useState(() => findUnsupported(parts.body))

  // Save state lives in refs so the editor callbacks always see the latest values.
  const editorRef = useRef<Editor | null>(null)
  const lastSaved = useRef(initial) // what we believe is on disk
  const frontMatter = useRef(parts.frontMatter) // kept aside, written back untouched
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inFlight = useRef<Promise<void>>(Promise.resolve())
  const slashRef = useRef<{ state: SlashMenuState | null; index: number }>({ state: null, index: 0 })
  slashRef.current = { state: slash, index: slashIndex }
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const serialize = (ed: Editor) => frontMatter.current + finishMarkdown(ed.getMarkdown())

  /** Puts a file's contents (from disk) into the editor without marking it as edited. */
  const loadFromDisk = (text: string) => {
    const { frontMatter: fm, body } = splitFrontMatter(text)
    frontMatter.current = fm
    lastSaved.current = text
    const blocked = findUnsupported(body)
    setUnsupported(blocked)
    const ed = editorRef.current
    if (ed && !ed.isDestroyed) {
      ed.setEditable(blocked.length === 0, false)
      ed.commands.setContent(body, { contentType: 'markdown', emitUpdate: false })
    }
  }

  /** Writes the current document if it changed. Saves never overlap. */
  const save = useCallback((snapshot?: string): Promise<void> => {
    clearTimeout(timer.current)
    const run = async () => {
      const editor = editorRef.current
      if (!dirty.current) return
      if (snapshot === undefined && (!editor || editor.isDestroyed)) return
      const md = snapshot ?? serialize(editor!)
      dirty.current = false
      setStatus('saving')
      const previous = lastSaved.current
      lastSaved.current = md // set first, so the file watcher recognises our own write
      const r = await window.wiki.writePage(notebook, section, page, md)
      if (r.ok) {
        setStatus(dirty.current ? 'unsaved' : 'saved')
      } else {
        lastSaved.current = previous
        dirty.current = true
        setStatus('error')
        onErrorRef.current(r.error.message)
      }
    }
    inFlight.current = inFlight.current.then(run, run)
    return inFlight.current
  }, [notebook, section, page])

  const pickImage = useCallback(async () => {
    const r = await window.wiki.pickImage(notebook, section)
    if (!r.ok) onErrorRef.current(r.error.message)
    return r.ok ? r.data : null
  }, [notebook, section])

  const insertImages = useCallback(
    async (files: File[], pos?: number) => {
      for (const file of files) {
        try {
          const src = await storeImage(notebook, section, file)
          const editor = editorRef.current
          if (!editor || editor.isDestroyed) return
          const chain = editor.chain().focus()
          if (pos !== undefined) chain.insertContentAt(pos, { type: 'image', attrs: { src, alt: '' } }).run()
          else chain.setImage({ src, alt: '' }).run()
        } catch (e) {
          onErrorRef.current(e instanceof Error ? e.message : String(e))
        }
      }
    },
    [notebook, section]
  )

  const extensions = useMemo(() => {
    const items = slashItems(pickImage)
    return createExtensions({
      resolveImageSrc: (src) => resolveImageSrc(notebook, section, src),
      extra: [
        Proofing,
        Search,
        SlashCommand.configure({
          items: (q) => filterSlashItems(items, q),
          onChange: (state) => {
            setSlash(state)
            setSlashIndex((i) => (state && i < state.items.length ? i : 0))
          },
          onKeyDown: (event) => {
            const { state, index } = slashRef.current
            if (!state || state.items.length === 0) return false
            const n = state.items.length
            if (event.key === 'ArrowDown') setSlashIndex((index + 1) % n)
            else if (event.key === 'ArrowUp') setSlashIndex((index - 1 + n) % n)
            else if (event.key === 'Enter' || event.key === 'Tab') state.choose(state.items[index])
            else return false
            return true
          }
        })
      ]
    })
  }, [notebook, section, pickImage])

  const editor = useEditor(
    {
      extensions,
      content: parts.body,
      contentType: 'markdown',
      editable: unsupported.length === 0,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      autofocus: false,
      editorProps: {
        attributes: { class: 'prose', spellcheck: 'false' },
        // Keep the cursor comfortably inside the window while typing: scroll before it reaches
        // the bottom edge (and stay clear of the sticky page bar at the top).
        scrollThreshold: { top: 90, bottom: 140, left: 0, right: 0 },
        scrollMargin: { top: 90, bottom: 160, left: 0, right: 0 },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])].filter(isImageFile)
          if (files.length === 0) return false
          void insertImages(files)
          return true
        },
        handleDrop: (view, event) => {
          const files = [...(event.dataTransfer?.files ?? [])].filter(isImageFile)
          if (files.length === 0) return false
          event.preventDefault()
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
          void insertImages(files, pos)
          return true
        },
        // Ctrl+click opens a link in the browser (plain click just places the cursor).
        handleClick: (_view, _pos, event) => {
          const a = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
          if (a && (event.ctrlKey || event.metaKey)) {
            window.open(a.href)
            return true
          }
          return false
        }
      },
      onCreate: ({ editor: ed }) => scheduleStats(ed as Editor),
      onTransaction: ({ editor: ed }) => scheduleStats(ed as Editor),
      onUpdate: ({ transaction }) => {
        if (!transaction.docChanged) return
        dirty.current = true
        setStatus('unsaved')
        clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(), getSettings().autosaveDelay || SAVE_DELAY_MS)
      }
    },
    [extensions]
  )
  editorRef.current = editor

  // Word/character counts for the status bar at the bottom of the window.
  useEffect(() => setActivePage({ stats }), [stats])
  useEffect(() => () => setActivePage({ stats: null }), [])

  // Make this editor the ribbon's target while it's open.
  useEffect(() => {
    if (!editor) return
    const html = () => editor.getHTML()
    const owner = {
      editor,
      insertImage: () =>
        void pickImage().then((src) => {
          if (src && !editor.isDestroyed) editor.chain().focus().setImage({ src, alt: '' }).run()
        }),
      openFind: (replace: boolean) => setFind((f) => ({ replace: replace || !!f?.replace, token: (f?.token ?? 0) + 1 })),
      exportPdf: () =>
        void window.wiki.exportPdf(html(), page).then((r) => {
          if (!r.ok) onErrorRef.current(r.error.message)
        }),
      print: () =>
        void window.wiki.printPage(html(), page).then((r) => {
          if (!r.ok) onErrorRef.current(r.error.message)
        })
    }
    setActivePage(owner)
    return () => clearActivePage(owner)
  }, [editor, pickImage, page])

  // Save on Ctrl+S, before the page is renamed/deleted (flushAllSaves), when switching pages,
  // and when the window closes (App registers flushAllSaves with onBeforeClose).
  useEffect(() => registerFlusher(() => save()), [save])
  useLayoutEffect(
    () => () => {
      // Leaving the page: grab the text now, while the editor still exists, then save it.
      const ed = editorRef.current
      if (dirty.current && ed && !ed.isDestroyed) void save(serialize(ed))
    },
    [save]
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc closes the find bar, wherever focus is (unless a dialog or menu is open).
      if (e.key === 'Escape' && findOpen.current && !document.querySelector('.backdrop, .menu')) {
        e.preventDefault()
        setFind(null)
        editorRef.current?.commands.focus()
        return
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        void save()
      } else if (key === 'f' || key === 'h') {
        // Find (Ctrl+F) / Replace (Ctrl+H) — not while typing in another box (e.g. a dialog).
        const t = e.target as HTMLElement | null
        if (t && t.closest('input, textarea, select, .dialog') && !t.closest('.find-bar')) return
        e.preventDefault()
        setFind((f) => ({ replace: key === 'h' || !!f?.replace, token: (f?.token ?? 0) + 1 }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  // The file changed on disk: reload it, unless there are unsaved edits — then ask.
  useEffect(
    () =>
      window.wiki.onChanged(async () => {
        const r = await window.wiki.readPage(notebook, section, page)
        if (!r.ok || r.data === lastSaved.current) return
        if (dirty.current) setConflict(r.data)
        else loadFromDisk(r.data)
      }),
    [notebook, section, page]
  )

  /** Right-click in the page: spelling suggestions for a misspelled word, then cut/copy/paste. */
  const onContextMenu = (e: React.MouseEvent) => {
    if (!editor || !(e.target as HTMLElement).closest('.prose')) return
    e.preventDefault()
    const items: (MenuItem | 'sep')[] = []
    const bad = (e.target as HTMLElement).closest('.spell-error') as HTMLElement | null
    if (bad && editor.isEditable) {
      const word = bad.dataset.word ?? bad.textContent ?? ''
      const from = editor.view.posAtDOM(bad, 0)
      const to = from + word.length
      const suggestions = getSpellChecker().suggest(word).slice(0, 6)
      for (const sug of suggestions) items.push({ label: sug, onClick: () => editor.chain().focus().insertContentAt({ from, to }, sug).run() })
      if (!suggestions.length) items.push({ label: 'No suggestions', onClick: () => {} })
      items.push('sep')
      items.push({
        label: `Add "${word}" to dictionary`,
        onClick: () => {
          const s = getSettings()
          if (!s.dictionary.includes(word)) updateSettings({ dictionary: [...s.dictionary, word].sort((a, b) => a.localeCompare(b)) })
          refreshSpelling(editor.view)
        }
      })
      items.push({
        label: 'Ignore',
        onClick: () => {
          ignoredWords.add(word.toLowerCase())
          refreshSpelling(editor.view)
        }
      })
      items.push('sep')
    }
    const hasSelection = !editor.state.selection.empty
    items.push(
      ...(editor.isEditable && hasSelection ? [{ label: 'Cut', shortcut: 'Ctrl+X', onClick: () => window.wiki.editCommand('cut') }] : []),
      ...(hasSelection ? [{ label: 'Copy', shortcut: 'Ctrl+C', onClick: () => window.wiki.editCommand('copy') }] : []),
      ...(editor.isEditable ? [{ label: 'Paste', shortcut: 'Ctrl+V', onClick: () => window.wiki.editCommand('paste') }] : []),
      { label: 'Select all', shortcut: 'Ctrl+A', onClick: () => editor.chain().focus().selectAll().run() },
      'sep',
      { label: 'Find…', shortcut: 'Ctrl+F', onClick: () => setFind((f) => ({ replace: !!f?.replace, token: (f?.token ?? 0) + 1 })) }
    )
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const resolveConflict = (useDisk: boolean) => {
    const disk = conflict
    setConflict(null)
    if (useDisk && disk !== null) {
      clearTimeout(timer.current)
      dirty.current = false
      loadFromDisk(disk)
      setStatus('saved')
    } else {
      dirty.current = true
      void save()
    }
  }

  return (
    <div className="editor-wrap" onContextMenu={onContextMenu}>
      {statusSlot ? createPortal(<SaveIndicator status={status} />, statusSlot) : <SaveIndicator status={status} />}
      {find && editor && (
        <FindBar
          editor={editor}
          showReplace={find.replace}
          setShowReplace={(replace) => setFind((f) => (f ? { ...f, replace } : f))}
          focusToken={find.token}
          onClose={() => {
            setFind(null)
            editor.commands.focus()
          }}
        />
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {conflict !== null && (
        <div className="conflict" role="alert">
          <span>This page was changed by another program while you were editing it.</span>
          <button onClick={() => resolveConflict(true)}>Load their version</button>
          <button className="primary" onClick={() => resolveConflict(false)}>
            Keep mine
          </button>
        </div>
      )}

      {unsupported.length > 0 && (
        <div className="notice" role="note">
          <span>
            This page contains {unsupported.join(' and ')}, which the editor can't display yet. It's open read-only so
            nothing is lost. If you edit it, those parts will be simplified when it's saved.
          </span>
          <button
            onClick={() => {
              setUnsupported([])
              editor?.setEditable(true)
              editor?.commands.focus()
            }}
          >
            Edit anyway
          </button>
        </div>
      )}

      {editor && (
        <>
          <DragHandle editor={editor} className="drag-handle">
            <div className="drag-grip" title="Drag to move this block">
              ⠿
            </div>
          </DragHandle>
          <FormatMenu editor={editor} />
        </>
      )}
      <EditorContent editor={editor} className="editor" />

      {slash && slash.items.length > 0 && slash.rect && (
        <SlashMenu state={slash} index={slashIndex} setIndex={setSlashIndex} />
      )}
    </div>
  )
}

export interface WordStats {
  words: number
  chars: number
  charsNoSpaces: number
  selWords: number
  selChars: number
}

const countWords = (t: string) => t.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu)?.length ?? 0

function computeStats(editor: Editor): WordStats {
  const { doc, selection } = editor.state
  const text = doc.textBetween(0, doc.content.size, ' ', ' ')
  return {
    words: countWords(text),
    chars: text.length,
    charsNoSpaces: text.replace(/\s/g, '').length,
    selWords: selection.empty ? 0 : countWords(doc.textBetween(selection.from, selection.to, ' ', ' ')),
    selChars: selection.empty ? 0 : doc.textBetween(selection.from, selection.to, ' ', ' ').length
  }
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label = { saved: 'Saved', unsaved: 'Editing…', saving: 'Saving…', error: 'Not saved' }[status]
  return (
    <div className={`save-status ${status}`} aria-live="polite" title={status === 'error' ? 'Saving failed. Press Ctrl+S to retry.' : 'Changes save automatically'}>
      {label}
    </div>
  )
}

function SlashMenu({ state, index, setIndex }: { state: SlashMenuState; index: number; setIndex(i: number): void }) {
  const ref = useRef<HTMLDivElement>(null)
  const rect = state.rect!
  const [pos, setPos] = useState({ left: rect.left, top: rect.bottom + 6 })

  // Flip above the cursor if there's no room below.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0
    const top = rect.bottom + 6 + h > window.innerHeight ? Math.max(8, rect.top - h - 6) : rect.bottom + 6
    setPos({ left: Math.min(rect.left, window.innerWidth - 280), top })
  }, [rect.left, rect.top, rect.bottom])

  useEffect(() => {
    ref.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  return (
    <div ref={ref} className="slash-menu" role="listbox" style={pos} onMouseDown={(e) => e.preventDefault()}>
      {state.items.map((item, i) => (
        <button
          key={item.id}
          role="option"
          aria-selected={i === index}
          className={i === index ? 'selected' : undefined}
          onMouseEnter={() => setIndex(i)}
          onClick={() => state.choose(item)}
        >
          <span className="slash-title">{item.title}</span>
          <span className="slash-hint">{item.hint}</span>
        </button>
      ))}
    </div>
  )
}

const shouldShowFormatMenu = ({ editor: e, state }: { editor: Editor; state: Editor['state'] }) =>
  !state.selection.empty && !e.isActive('codeBlock') && !e.isActive('image') && e.isEditable

/** Small toolbar shown above selected text. */
function FormatMenu({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false)
  const [href, setHref] = useState('')
  const [, force] = useState(0)

  // Re-render on selection changes so the active states are right.
  useEffect(() => {
    const update = () => force((n) => n + 1)
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
    }
  }, [editor])

  // Must be stable: BubbleMenu sends an update to the editor whenever these change,
  // and this component re-renders on every update (that used to loop endlessly).
  const menuOptions = useMemo(() => ({ placement: 'top' as const, onHide: () => setLinking(false) }), [])

  const btn = (label: string, title: string, active: boolean, run: () => void, cls = '') => (
    <button className={`${cls}${active ? ' active' : ''}`} title={title} aria-pressed={active} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {label}
    </button>
  )

  const applyLink = () => {
    const url = href.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (url) chain.setLink({ href: /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}` }).run()
    else chain.unsetLink().run()
    setLinking(false)
  }

  return (
    <BubbleMenu editor={editor} className="format-menu" shouldShow={shouldShowFormatMenu} options={menuOptions}>
      {linking ? (
        <form
          className="link-form"
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
        >
          <input
            autoFocus
            value={href}
            placeholder="Paste or type a link"
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setLinking(false)
                editor.commands.focus()
              }
            }}
          />
          <button type="submit">{href.trim() ? 'Apply' : 'Remove'}</button>
        </form>
      ) : (
        <>
          {btn('B', 'Bold (Ctrl+B)', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'b')}
          {btn('I', 'Italic (Ctrl+I)', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'i')}
          {btn('S', 'Strikethrough (Ctrl+Shift+S)', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 's')}
          {btn('</>', 'Inline code (Ctrl+E)', editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), 'code')}
          <span className="sep" />
          {btn('H1', 'Heading 1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
          {btn('H2', 'Heading 2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          <span className="sep" />
          {btn('Link', 'Add or edit link (Ctrl+click a link to open it)', editor.isActive('link'), () => {
            setHref(editor.getAttributes('link').href ?? '')
            setLinking(true)
          })}
        </>
      )}
    </BubbleMenu>
  )
}
