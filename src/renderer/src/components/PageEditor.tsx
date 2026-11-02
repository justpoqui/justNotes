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
      onUpdate: ({ transaction }) => {
        if (!transaction.docChanged) return
        dirty.current = true
        setStatus('unsaved')
        clearTimeout(timer.current)
        timer.current = setTimeout(() => void save(), SAVE_DELAY_MS)
      }
    },
    [extensions]
  )
  editorRef.current = editor

  // Make this editor the ribbon's target while it's open.
  useEffect(() => {
    if (!editor) return
    const owner = {
      editor,
      insertImage: () =>
        void pickImage().then((src) => {
          if (src && !editor.isDestroyed) editor.chain().focus().setImage({ src, alt: '' }).run()
        })
    }
    setActivePage(owner)
    return () => clearActivePage(owner)
  }, [editor, pickImage])

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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
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
    <div className="editor-wrap">
      {statusSlot ? createPortal(<SaveIndicator status={status} />, statusSlot) : <SaveIndicator status={status} />}
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
    <BubbleMenu
      editor={editor}
      className="format-menu"
      shouldShow={({ editor: e, state }) => !state.selection.empty && !e.isActive('codeBlock') && !e.isActive('image') && e.isEditable}
      options={{ placement: 'top', onHide: () => setLinking(false) }}
    >
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
