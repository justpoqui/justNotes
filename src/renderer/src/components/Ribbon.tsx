// Office-style ribbon across the top: tabs (Home, Insert, Draw, View) with
// grouped buttons that act on the open page or whiteboard.

import type { Editor } from '@tiptap/react'
import React, { useEffect, useRef, useState } from 'react'
import { useActivePage, type BoardControls } from '../editor/activePage'
import { load, save } from '../lib/storage'
import * as Ic from './RibbonIcons'

export type PageMode = 'page' | 'board'
type Tool = Parameters<BoardControls['setTool']>[0]

interface Props {
  /** Folder that a new page / section would go into (null = nothing suitable selected). */
  sectionKey: string | null
  notebookKey: string | null
  hasPage: boolean
  mode: PageMode
  setMode(mode: PageMode): void
  startCreate(parentKey: string | null): void
  sidebarVisible: boolean
  toggleSidebar(): void
  theme: 'dark' | 'light'
  setTheme(theme: 'dark' | 'light'): void
  zoom: number
  onZoom(direction: 'in' | 'out' | 'reset'): void
  openRootFolder(): void
  revealPage(): void
}

const TABS = ['Home', 'Insert', 'Draw', 'View'] as const
type Tab = (typeof TABS)[number]

/** Re-render whenever the editor's content or selection changes (for active button states). */
function useEditorTick(editor: Editor | null) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!editor) return
    const bump = () => setTick((t) => t + 1)
    editor.on('transaction', bump)
    editor.on('selectionUpdate', bump)
    editor.on('focus', bump)
    return () => {
      editor.off('transaction', bump)
      editor.off('selectionUpdate', bump)
      editor.off('focus', bump)
    }
  }, [editor])
}

function Btn({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  title,
  wide = false
}: {
  icon?: React.ComponentType
  label: string
  onClick(): void
  active?: boolean
  disabled?: boolean
  title?: string
  wide?: boolean
}) {
  return (
    <button
      className={`rb-btn${active ? ' active' : ''}${wide ? ' wide' : ''}`}
      // Keep focus (and the text selection) in the editor while clicking ribbon buttons.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-pressed={active}
    >
      {Icon && <Icon />}
      <span>{label}</span>
    </button>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rb-group" role="group" aria-label={label}>
      <div className="rb-items">{children}</div>
      <div className="rb-label">{label}</div>
    </div>
  )
}

export function Ribbon(props: Props) {
  const [tab, setTab] = useState<Tab>(() => load<Tab>('jn.ribbonTab', 'Home'))
  useEffect(() => save('jn.ribbonTab', tab), [tab])
  const { editor, board, insertImage } = useActivePage()
  useEditorTick(editor)

  // A drawing tool picked while in page mode is applied once the whiteboard has loaded.
  const pendingTool = useRef<Tool | null>(null)
  const [boardTool, setBoardTool] = useState<string | null>(null)
  useEffect(() => {
    if (!board) return setBoardTool(null)
    if (pendingTool.current) {
      board.setTool(pendingTool.current)
      pendingTool.current = null
    }
    setBoardTool(board.activeTool())
    // Follow tool changes made inside the whiteboard (toolbar, keyboard shortcuts).
    return board.subscribe(() => setBoardTool(board.activeTool()))
  }, [board])

  const ed = editor && !editor.isDestroyed && editor.isEditable && props.mode === 'page' ? editor : null
  const chain = () => ed!.chain().focus()
  const is = (name: string, attrs?: Record<string, unknown>) => !!ed?.isActive(name, attrs)
  // Inserting a block never replaces selected text: it goes after the selection.
  const chainAtEnd = () => chain().setTextSelection(ed!.state.selection.to)

  const pickTool = (tool: Tool) => {
    if (props.mode !== 'board' || !board) {
      pendingTool.current = tool
      props.setMode('board')
    } else board.setTool(tool)
  }

  return (
    <header className="ribbon">
      <div className="rb-tabs" role="tablist">
        <span className="app-name">justNotes</span>
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`rb-tab${tab === t ? ' selected' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="rb-panel" role="tabpanel" aria-label={tab}>
        {tab === 'Home' && (
          <>
            <Group label="History">
              <Btn icon={Ic.Undo} label="Undo" title="Undo (Ctrl+Z)" disabled={!ed && !(props.mode === 'board' && board)} onClick={() => (ed ? chain().undo().run() : board?.undo())} />
              <Btn icon={Ic.Redo} label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!ed && !(props.mode === 'board' && board)} onClick={() => (ed ? chain().redo().run() : board?.redo())} />
            </Group>
            <Group label="Text">
              <div className="rb-grid">
                <button className={`rb-mini b${is('bold') ? ' active' : ''}`} title="Bold (Ctrl+B)" disabled={!ed} onMouseDown={(e) => e.preventDefault()} onClick={() => chain().toggleBold().run()}>
                  B
                </button>
                <button className={`rb-mini i${is('italic') ? ' active' : ''}`} title="Italic (Ctrl+I)" disabled={!ed} onMouseDown={(e) => e.preventDefault()} onClick={() => chain().toggleItalic().run()}>
                  I
                </button>
                <button className={`rb-mini s${is('strike') ? ' active' : ''}`} title="Strikethrough (Ctrl+Shift+S)" disabled={!ed} onMouseDown={(e) => e.preventDefault()} onClick={() => chain().toggleStrike().run()}>
                  S
                </button>
                <button className={`rb-mini code${is('code') ? ' active' : ''}`} title="Inline code (Ctrl+E)" disabled={!ed} onMouseDown={(e) => e.preventDefault()} onClick={() => chain().toggleCode().run()}>
                  {'</>'}
                </button>
              </div>
              <Btn icon={Ic.ClearFormat} label="Clear" title="Clear formatting" disabled={!ed} onClick={() => chain().unsetAllMarks().clearNodes().run()} />
            </Group>
            <Group label="Styles">
              <div className="rb-styles">
                {(
                  [
                    ['Normal', 0],
                    ['Heading 1', 1],
                    ['Heading 2', 2],
                    ['Heading 3', 3]
                  ] as const
                ).map(([label, level]) => (
                  <button
                    key={label}
                    className={`rb-style h${level}${(level === 0 ? is('paragraph') : is('heading', { level })) ? ' active' : ''}`}
                    disabled={!ed}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (level === 0 ? chain().setParagraph().run() : chain().setHeading({ level }).run())}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Group>
            <Group label="Paragraph">
              <Btn icon={Ic.Bullets} label="Bullets" disabled={!ed} active={is('bulletList')} onClick={() => chain().toggleBulletList().run()} />
              <Btn icon={Ic.Numbers} label="Numbering" disabled={!ed} active={is('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
              <Btn icon={Ic.Todo} label="To-do" disabled={!ed} active={is('taskList')} onClick={() => chain().toggleTaskList().run()} />
              <Btn icon={Ic.Quote} label="Quote" disabled={!ed} active={is('blockquote')} onClick={() => chain().toggleBlockquote().run()} />
              <Btn
                icon={Ic.Outdent}
                label="Outdent"
                title="Outdent list item (Shift+Tab)"
                disabled={!ed || !(ed.can().liftListItem('listItem') || ed.can().liftListItem('taskItem'))}
                onClick={() => (ed!.can().liftListItem('taskItem') ? chain().liftListItem('taskItem').run() : chain().liftListItem('listItem').run())}
              />
              <Btn
                icon={Ic.Indent}
                label="Indent"
                title="Indent list item (Tab)"
                disabled={!ed || !(ed.can().sinkListItem('listItem') || ed.can().sinkListItem('taskItem'))}
                onClick={() => (ed!.can().sinkListItem('taskItem') ? chain().sinkListItem('taskItem').run() : chain().sinkListItem('listItem').run())}
              />
            </Group>
          </>
        )}

        {tab === 'Insert' && (
          <>
            <Group label="Notebook">
              <Btn icon={Ic.NewPage} label="New page" disabled={!props.sectionKey} title={props.sectionKey ? 'New page in this section' : 'Select a section first'} onClick={() => props.startCreate(props.sectionKey)} />
              <Btn icon={Ic.NewSection} label="New section" disabled={!props.notebookKey} title={props.notebookKey ? 'New section in this notebook' : 'Select a notebook first'} onClick={() => props.startCreate(props.notebookKey)} />
              <Btn icon={Ic.NewNotebook} label="New notebook" onClick={() => props.startCreate(null)} />
            </Group>
            <Group label="Blocks">
              <Btn icon={Ic.Table} label="Table" disabled={!ed} onClick={() => chainAtEnd().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
              <Btn icon={Ic.ImageIcon} label="Picture" disabled={!ed || !insertImage} onClick={() => insertImage?.()} />
              <Btn icon={Ic.Code} label="Code" disabled={!ed} active={is('codeBlock')} onClick={() => chain().toggleCodeBlock().run()} />
              <Btn icon={Ic.Divider} label="Divider" disabled={!ed} onClick={() => chainAtEnd().setHorizontalRule().run()} />
              <LinkButton editor={ed} />
            </Group>
          </>
        )}

        {tab === 'Draw' && (
          <>
            <Group label="View">
              <Btn icon={Ic.PageMode} label="Page" disabled={!props.hasPage} active={props.hasPage && props.mode === 'page'} onClick={() => props.setMode('page')} />
              <Btn icon={Ic.BoardMode} label="Whiteboard" disabled={!props.hasPage} active={props.hasPage && props.mode === 'board'} onClick={() => props.setMode('board')} />
            </Group>
            <Group label="Tools">
              {(
                [
                  ['selection', 'Select', Ic.Select, 'V'],
                  ['hand', 'Pan', Ic.Hand, 'H'],
                  ['freedraw', 'Pen', Ic.Pen, 'P'],
                  ['rectangle', 'Box', Ic.Rect, 'R'],
                  ['ellipse', 'Circle', Ic.Ellipse, 'O'],
                  ['arrow', 'Arrow', Ic.Arrow, 'A'],
                  ['text', 'Text', Ic.TextTool, 'T'],
                  ['image', 'Picture', Ic.ImageIcon, '9'],
                  ['eraser', 'Eraser', Ic.Eraser, 'E']
                ] as const
              ).map(([tool, label, icon, key]) => (
                <Btn
                  key={tool}
                  icon={icon}
                  label={label}
                  title={`${label} (${key})`}
                  disabled={!props.hasPage}
                  active={props.mode === 'board' && boardTool === tool}
                  onClick={() => pickTool(tool)}
                />
              ))}
            </Group>
          </>
        )}

        {tab === 'View' && (
          <>
            <Group label="Layout">
              <Btn icon={Ic.Sidebar} label={props.sidebarVisible ? 'Hide sidebar' : 'Show sidebar'} active={props.sidebarVisible} onClick={props.toggleSidebar} wide />
            </Group>
            <Group label="Theme">
              <Btn icon={Ic.Moon} label="Dark" active={props.theme === 'dark'} onClick={() => props.setTheme('dark')} />
              <Btn icon={Ic.Sun} label="Light" active={props.theme === 'light'} onClick={() => props.setTheme('light')} />
            </Group>
            <Group label={`Zoom · ${Math.round(props.zoom * 100)}%`}>
              <Btn icon={Ic.ZoomOut} label="Smaller" title="Zoom out (Ctrl+-)" onClick={() => props.onZoom('out')} />
              <Btn icon={Ic.ZoomReset} label="100%" title="Reset zoom (Ctrl+0)" onClick={() => props.onZoom('reset')} />
              <Btn icon={Ic.ZoomIn} label="Bigger" title="Zoom in (Ctrl+=)" onClick={() => props.onZoom('in')} />
            </Group>
            <Group label="Files">
              <Btn icon={Ic.Folder} label="WikiBook folder" onClick={props.openRootFolder} wide />
              <Btn icon={Ic.Reveal} label="Show page file" disabled={!props.hasPage} onClick={props.revealPage} wide />
            </Group>
          </>
        )}
      </div>
    </header>
  )
}

/** Insert ▸ Link: small pop-over to type a URL. */
function LinkButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState('')
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const apply = () => {
    setOpen(false)
    if (!editor) return
    const url = href.trim()
    if (!url) return void editor.chain().focus().extendMarkRange('link').unsetLink().run()
    const full = /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}`
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: full } }] }).run()
    } else editor.chain().focus().extendMarkRange('link').setLink({ href: full }).run()
  }

  return (
    <div className="rb-pop-wrap" ref={wrap}>
      <Btn
        icon={Ic.LinkIcon}
        label="Link"
        disabled={!editor}
        active={!!editor?.isActive('link')}
        onClick={() => {
          setHref(editor?.getAttributes('link').href ?? '')
          setOpen((o) => !o)
        }}
      />
      {open && (
        <form
          className="rb-pop"
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <input autoFocus value={href} placeholder="https://…" onChange={(e) => setHref(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} />
          <button type="submit" className="primary">
            {href.trim() ? 'Apply' : 'Remove'}
          </button>
        </form>
      )}
    </div>
  )
}
