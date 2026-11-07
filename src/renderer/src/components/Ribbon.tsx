// Office-style ribbon across the top: tabs (Home, Insert, Draw, View) with
// grouped buttons that act on the open page or whiteboard.

import { NodeSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import React, { useEffect, useRef, useState } from 'react'
import { useActivePage, type BoardControls } from '../editor/activePage'
import { dateFormats, insertDate } from '../editor/dateTime'
import { updateSettings, useSettings } from '../lib/settings'
import { load, save } from '../lib/storage'
import * as Ic from './RibbonIcons'
import logo from '../assets/logo.png'
import { useUpdateState } from '../lib/updates'

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
  openRootFolder(): void
  revealPage(): void
  onOpenNotebook(): void
  onRenameNotebook(): void
  onRevealNotebook(): void
  onOpenSettings(): void
  onShortcuts(): void
  onBackup(): void
  onRestoreBackup(): void
  onTrash(): void
  onHistory(): void
  onTemplate(): void
  /** Adds a picture of the whiteboard to the page. */
  onSnapshot(): void
  /** Recently opened / favorite pages (keys "Notebook/Section/Page"). */
  recent: string[]
  favorites: string[]
  isFavorite: boolean
  toggleFavorite(): void
  openPage(key: string): void
  /** Opens Quick open (Ctrl+P). */
  onQuickOpen(): void
  /** Opens the Updates window. */
  onUpdates(): void
}

const TABS = ['File', 'Home', 'Insert', 'Draw', 'View'] as const
/** Extra tabs that appear only while the cursor is in a table / a picture is selected (like Office). */
const CONTEXT_TABS = ['Table', 'Picture'] as const

// Text colors chosen to stay readable on both the dark and the light theme.
const TEXT_COLORS = [
  ['Red', '#e06c75'],
  ['Orange', '#e0904f'],
  ['Gold', '#c9a227'],
  ['Green', '#5fae5a'],
  ['Teal', '#3fa7a3'],
  ['Blue', '#4f8fe6'],
  ['Purple', '#a274d9'],
  ['Pink', '#d16fa5'],
  ['Gray', '#8e9095']
] as const
// null = the default yellow highlight (saved as ==text==).
const HIGHLIGHTS = [
  ['Yellow', null, '#f6e58d'],
  ['Green', '#b8e6a6', '#b8e6a6'],
  ['Blue', '#a8d1f5', '#a8d1f5'],
  ['Pink', '#f5b8d0', '#f5b8d0'],
  ['Orange', '#f8cf9c', '#f8cf9c'],
  ['Purple', '#d4c2f5', '#d4c2f5']
] as const
const GENERIC_FONTS = ['sans-serif', 'serif', 'monospace']
const FONT_SIZES = ['10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px']
type Tab = (typeof TABS)[number] | (typeof CONTEXT_TABS)[number]

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

/** Small square button for the two-row groups (Font, Paragraph). */
function Mini({ label, icon: Icon, cls = '', title, active = false, disabled = false, onClick }: { label?: string; icon?: React.ComponentType; cls?: string; title: string; active?: boolean; disabled?: boolean; onClick(): void }) {
  return (
    <button
      className={`rb-mini ${cls}${active ? ' active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {Icon ? <Icon /> : label}
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
  const [tab, setTab] = useState<Tab>(() => {
    const t = load<Tab>('jn.ribbonTab', 'Home')
    return (TABS as readonly string[]).includes(t) ? t : 'Home'
  })
  useEffect(() => save('jn.ribbonTab', (TABS as readonly string[]).includes(tab) ? tab : 'Home'), [tab])
  const settings = useSettings()
  const { editor, board, insertImage, openFind, exportPdf } = useActivePage()
  const [fonts, setFonts] = useState<string[]>([])
  useEffect(() => {
    void window.wiki.listFonts().then((r) => r.ok && setFonts(r.data))
  }, [])
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

  // Table / Picture tabs show while they apply; a vanished one falls back to Home.
  const inTable = is('table')
  const onPicture = !!ed && ed.state.selection instanceof NodeSelection && ed.state.selection.node.type.name === 'image'
  const contextTabs = CONTEXT_TABS.filter((t) => (t === 'Table' ? inTable : onPicture))
  const shownTab: Tab = (CONTEXT_TABS as readonly string[]).includes(tab) && !contextTabs.includes(tab as (typeof CONTEXT_TABS)[number]) ? 'Home' : tab
  // Opening the whiteboard brings up the Draw tab; going back to the page brings back Home.
  const prevMode = useRef(props.mode)
  useEffect(() => {
    if (prevMode.current === props.mode) return
    prevMode.current = props.mode
    if (props.mode === 'board') setTab((t) => (t === 'Home' || t === 'Insert' || t === 'Table' || t === 'Picture' ? 'Draw' : t))
    else setTab((t) => (t === 'Draw' ? 'Home' : t))
  }, [props.mode])
  const picture = onPicture ? ed!.getAttributes('image') : null
  const setPicWidth = (w: number | null) => chain().updateAttributes('image', { width: w }).run()

  const pickTool = (tool: Tool) => {
    if (props.mode !== 'board' || !board) {
      pendingTool.current = tool
      props.setMode('board')
    } else board.setTool(tool)
  }

  return (
    <header className="ribbon">
      <div className="rb-tabs" role="tablist">
        <span className="app-name">
          <img src={logo} alt="" draggable={false} />
          justNotes
        </span>
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={shownTab === t} className={`rb-tab${shownTab === t ? ' selected' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        {contextTabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={shownTab === t}
            className={`rb-tab contextual${shownTab === t ? ' selected' : ''}`}
            title={t === 'Table' ? 'Rows, columns and other table tools' : 'Size and position of the selected picture'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
        <span className="titlebar-drag" />
        <UpdatePill onClick={props.onUpdates} />
        <WindowButtons />
      </div>

      <div className="rb-panel" role="tabpanel" aria-label={shownTab}>
        {shownTab === 'File' && (
          <>
            <Group label="Notebook">
              <Btn icon={Ic.NewNotebook} label="New notebook" wide onClick={() => props.startCreate(null)} />
              <Btn icon={Ic.Folder} label="Open" title="Open another notebook" onClick={props.onOpenNotebook} />
              <Btn icon={Ic.Rename} label="Rename" title="Rename this notebook (to delete it, right-click the Notebook button)" disabled={!props.notebookKey} onClick={props.onRenameNotebook} />
            </Group>
            <Group label="Backup">
              <Btn icon={Ic.Backup} label="Back up" title="Save this notebook as a .zip file" disabled={!props.notebookKey} onClick={props.onBackup} />
              <Btn icon={Ic.RestoreBackup} label="Restore backup" wide title="Add a notebook from a .zip backup" onClick={props.onRestoreBackup} />
              <Btn icon={Ic.Bin} label="Recycle bin" wide title="Deleted notebooks, sections and pages (kept 30 days)" onClick={props.onTrash} />
            </Group>
            <Group label="Export">
              <Btn icon={Ic.Pdf} label="Page as PDF" wide disabled={!exportPdf || props.mode !== 'page'} title="Save the open page as a PDF" onClick={() => exportPdf?.()} />
            </Group>
            <Group label="Show in file manager">
              <Btn icon={Ic.FileReveal} label="This page" wide title="Show this page's file in the file manager" disabled={!props.hasPage} onClick={props.revealPage} />
              <Btn icon={Ic.Reveal} label="This notebook" wide title="Show this notebook's folder in the file manager" disabled={!props.notebookKey} onClick={props.onRevealNotebook} />
              <Btn icon={Ic.Folders} label="All notebooks" wide title="Open the folder with all your notebooks" onClick={props.openRootFolder} />
            </Group>
            <Group label="Options">
              <Btn icon={Ic.Gear} label="Settings" title="Settings (Ctrl+,)" onClick={props.onOpenSettings} />
              <Btn icon={Ic.Keyboard} label="Shortcuts" title="Keyboard shortcuts (F1)" onClick={props.onShortcuts} />
              <Btn icon={Ic.Download} label="Updates" title="Check for a new version of justNotes" onClick={props.onUpdates} />
            </Group>
          </>
        )}

        {shownTab === 'Home' && (
          <>
            <Group label="Font">
              <div className="rb-rows">
                <div className="rb-row">
                  <select
                    className="rb-select family"
                    aria-label="Font"
                    title="Font"
                    disabled={!ed}
                    value={(ed?.getAttributes('textStyle').fontFamily as string | undefined)?.replace(/["']/g, '') || ''}
                    onChange={(e) => (e.target.value ? chain().setFontFamily(/[\s]/.test(e.target.value) && !GENERIC_FONTS.includes(e.target.value) ? `'${e.target.value}'` : e.target.value).run() : chain().unsetFontFamily().run())}
                  >
                    <option value="">Font: default</option>
                    <optgroup label="General">
                      <option value="sans-serif">Sans-serif</option>
                      <option value="serif">Serif</option>
                      <option value="monospace">Monospace</option>
                    </optgroup>
                    {fonts.length > 0 && (
                      <optgroup label="Installed fonts">
                        {fonts.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <select
                    className="rb-select size"
                    aria-label="Font size"
                    title="Font size"
                    disabled={!ed}
                    value={(ed?.getAttributes('textStyle').fontSize as string | undefined) || ''}
                    onChange={(e) => (e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run())}
                  >
                    <option value="">Size</option>
                    {FONT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {parseInt(size, 10)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rb-row">
                  <Mini label="B" cls="b" title="Bold (Ctrl+B)" disabled={!ed} active={is('bold')} onClick={() => chain().toggleBold().run()} />
                  <Mini label="I" cls="i" title="Italic (Ctrl+I)" disabled={!ed} active={is('italic')} onClick={() => chain().toggleItalic().run()} />
                  <Mini label="U" cls="u" title="Underline (Ctrl+U)" disabled={!ed} active={is('underline')} onClick={() => chain().toggleUnderline().run()} />
                  <Mini label="S" cls="s" title="Strikethrough (Ctrl+Shift+S)" disabled={!ed} active={is('strike')} onClick={() => chain().toggleStrike().run()} />
                  <Mini label="</>" cls="code" title="Inline code (Ctrl+E)" disabled={!ed} active={is('code')} onClick={() => chain().toggleCode().run()} />
                  <Swatches
                    label="Font color"
                    letter="A"
                    disabled={!ed}
                    current={(ed?.getAttributes('textStyle').color as string | undefined) ?? null}
                    colors={TEXT_COLORS.map(([name, c]) => ({ name, value: c, swatch: c }))}
                    defaultLabel="Automatic"
                    onPick={(c) => (c ? chain().setColor(c).run() : chain().unsetColor().run())}
                  />
                  <Swatches
                    label="Highlight"
                    letter="ab"
                    highlight
                    disabled={!ed}
                    current={is('highlight') ? ((ed?.getAttributes('highlight').color as string | undefined) ?? 'default') : null}
                    colors={HIGHLIGHTS.map(([name, value, swatch]) => ({ name, value: value ?? 'default', swatch }))}
                    defaultLabel="No highlight"
                    onPick={(c) => (c === null ? chain().unsetHighlight().run() : c === 'default' ? chain().setHighlight().run() : chain().setHighlight({ color: c }).run())}
                  />
                  <Mini icon={Ic.ClearFormat} title="Clear formatting" disabled={!ed} onClick={() => chain().unsetAllMarks().clearNodes().run()} />
                </div>
              </div>
            </Group>
            <Group label="Paragraph">
              <div className="rb-rows">
                <div className="rb-row">
                  <Mini icon={Ic.Bullets} title="Bullets" disabled={!ed} active={is('bulletList')} onClick={() => chain().toggleBulletList().run()} />
                  <Mini icon={Ic.Numbers} title="Numbering" disabled={!ed} active={is('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
                  <Mini icon={Ic.Todo} title="To-do list" disabled={!ed} active={is('taskList')} onClick={() => chain().toggleTaskList().run()} />
                  <Mini
                    icon={Ic.Outdent}
                    title="Outdent list item (Shift+Tab)"
                    disabled={!ed || !(ed.can().liftListItem('listItem') || ed.can().liftListItem('taskItem'))}
                    onClick={() => (ed!.can().liftListItem('taskItem') ? chain().liftListItem('taskItem').run() : chain().liftListItem('listItem').run())}
                  />
                  <Mini
                    icon={Ic.Indent}
                    title="Indent list item (Tab)"
                    disabled={!ed || !(ed.can().sinkListItem('listItem') || ed.can().sinkListItem('taskItem'))}
                    onClick={() => (ed!.can().sinkListItem('taskItem') ? chain().sinkListItem('taskItem').run() : chain().sinkListItem('listItem').run())}
                  />
                </div>
                <div className="rb-row">
                  {(
                    [
                      ['left', 'Align left (Ctrl+Shift+L)', Ic.AlignLeft],
                      ['center', 'Center (Ctrl+Shift+E)', Ic.AlignCenter],
                      ['right', 'Align right (Ctrl+Shift+R)', Ic.AlignRight],
                      ['justify', 'Justify (Ctrl+Shift+J)', Ic.AlignJustify]
                    ] as const
                  ).map(([align, title, icon]) => (
                    <Mini
                      key={align}
                      icon={icon}
                      title={title}
                      disabled={!ed}
                      active={!!ed && (align === 'left' ? !['center', 'right', 'justify'].some((a) => ed.isActive({ textAlign: a })) : ed.isActive({ textAlign: align }))}
                      onClick={() => (align === 'left' ? chain().unsetTextAlign().run() : chain().setTextAlign(align).run())}
                    />
                  ))}
                  <Mini icon={Ic.Quote} title="Quote" disabled={!ed} active={is('blockquote')} onClick={() => chain().toggleBlockquote().run()} />
                </div>
              </div>
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
            <Group label="Editing">
              <Btn icon={Ic.Find} label="Find" title="Find in page (Ctrl+F)" disabled={!openFind} onClick={() => openFind?.(false)} />
              <Btn icon={Ic.Replace} label="Replace" title="Find and replace (Ctrl+H)" disabled={!openFind || !ed} onClick={() => openFind?.(true)} />
            </Group>
          </>
        )}

        {shownTab === 'Insert' && (
          <>
            <Group label="Notebook">
              <Btn icon={Ic.NewPage} label="New page" disabled={!props.sectionKey} title={props.sectionKey ? 'New page in this section' : 'Select a section first'} onClick={() => props.startCreate(props.sectionKey)} />
              <Btn icon={Ic.Template} label="From template" wide disabled={!props.sectionKey} title="New page from a template (meeting notes, journal, …)" onClick={props.onTemplate} />
              <Btn icon={Ic.NewSection} label="New section" disabled={!props.notebookKey} title={props.notebookKey ? 'New section in this notebook' : 'Select a notebook first'} onClick={() => props.startCreate(props.notebookKey)} />
            </Group>
            <Group label="Blocks">
              <Btn icon={Ic.Table} label="Table" disabled={!ed} onClick={() => chainAtEnd().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
              <Btn icon={Ic.ImageIcon} label="Picture" disabled={!ed || !insertImage} onClick={() => insertImage?.()} />
              <Btn icon={Ic.Code} label="Code" disabled={!ed} active={is('codeBlock')} onClick={() => chain().toggleCodeBlock().run()} />
              <Btn icon={Ic.Divider} label="Divider" disabled={!ed} onClick={() => chainAtEnd().setHorizontalRule().run()} />
              <LinkButton editor={ed} />
              <DateButton editor={ed} />
            </Group>
          </>
        )}

        {shownTab === 'Draw' && (
          <>
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
            <Group label="Whiteboard">
              <Btn icon={Ic.Snapshot} label="Add to page" wide disabled={!props.hasPage || props.mode !== 'board' || !board} title="Add a picture of this whiteboard to the end of the page" onClick={props.onSnapshot} />
            </Group>
          </>
        )}

        {shownTab === 'Table' && ed && (
          <>
            <Group label="Rows">
              <Btn icon={Ic.RowAbove} label="Insert above" wide onClick={() => chain().addRowBefore().run()} />
              <Btn icon={Ic.RowBelow} label="Insert below" wide onClick={() => chain().addRowAfter().run()} />
              <Btn icon={Ic.DeleteRow} label="Delete row" wide disabled={!ed.can().deleteRow()} onClick={() => chain().deleteRow().run()} />
            </Group>
            <Group label="Columns">
              <Btn icon={Ic.ColLeft} label="Insert left" wide onClick={() => chain().addColumnBefore().run()} />
              <Btn icon={Ic.ColRight} label="Insert right" wide onClick={() => chain().addColumnAfter().run()} />
              <Btn icon={Ic.DeleteCol} label="Delete column" wide disabled={!ed.can().deleteColumn()} onClick={() => chain().deleteColumn().run()} />
            </Group>
            <Group label="Table">
              <Btn icon={Ic.HeaderRow} label="Header row" wide active={tableHasHeader(ed)} title="Make the first row a header row (bold) or a normal row" onClick={() => chain().toggleHeaderRow().run()} />
              <Btn icon={Ic.DeleteTable} label="Delete table" wide onClick={() => chain().deleteTable().run()} />
            </Group>
          </>
        )}

        {shownTab === 'Picture' && ed && picture && (
          <>
            <Group label="Size">
              {(
                [
                  ['Small', 200, Ic.PicSmall],
                  ['Medium', 400, Ic.PicMedium],
                  ['Large', 600, Ic.PicLarge]
                ] as const
              ).map(([label, w, icon]) => (
                <Btn key={label} icon={icon} label={label} title={`${w} pixels wide`} active={picture.width === w} onClick={() => setPicWidth(w)} />
              ))}
              <Btn icon={Ic.PageWidth} label="Original size" wide title="Its own size, never wider than the page" active={!picture.width} onClick={() => setPicWidth(null)} />
            </Group>
            <Group label="Position">
              {(
                [
                  ['left', 'Left', Ic.AlignLeft],
                  ['center', 'Center', Ic.AlignCenter],
                  ['right', 'Right', Ic.AlignRight]
                ] as const
              ).map(([align, label, icon]) => (
                <Btn
                  key={align}
                  icon={icon}
                  label={label}
                  active={(picture.textAlign || 'left') === align}
                  onClick={() => (align === 'left' ? chain().unsetTextAlign().run() : chain().setTextAlign(align).run())}
                />
              ))}
            </Group>
            <Group label="Picture">
              <Btn icon={Ic.Trash} label="Delete" title="Remove the picture from the page (the file stays in assets/)" onClick={() => chain().deleteSelection().run()} />
            </Group>
          </>
        )}

        {shownTab === 'View' && (
          <>
            <Group label="Layout">
              <Btn icon={Ic.Sidebar} label={props.sidebarVisible ? 'Hide sidebar' : 'Show sidebar'} active={props.sidebarVisible} onClick={props.toggleSidebar} wide />
              <Btn
                icon={Ic.PageWidth}
                label="Wide page"
                wide
                active={settings.pageWidth === 'wide'}
                title={settings.pageWidth === 'wide' ? 'Back to the normal page width (easier to read)' : 'Use more of the window for the page'}
                onClick={() => updateSettings({ pageWidth: settings.pageWidth === 'wide' ? 'normal' : 'wide' })}
              />
            </Group>
            <Group label="Theme">
              <Btn icon={Ic.Moon} label="Dark" active={props.theme === 'dark'} onClick={() => props.setTheme('dark')} />
              <Btn icon={Ic.Sun} label="Light" active={props.theme === 'light'} onClick={() => props.setTheme('light')} />
            </Group>
            <Group label="Go to">
              <Btn icon={Ic.Find} label="Go to page" wide title="Find any page or section by name (Ctrl+P)" onClick={props.onQuickOpen} />
              <PageList label="Recent" icon={Ic.Clock} empty="No recent pages yet." pages={props.recent} openPage={props.openPage} />
              <PageList label="Favorites" icon={Ic.Star} empty={'No favorites yet. Use "Add to Favorites" on a page.'} pages={props.favorites} openPage={props.openPage} />
            </Group>
            <Group label="This page">
              <Btn
                icon={props.isFavorite ? Ic.StarFilled : Ic.Star}
                label={props.isFavorite ? 'In Favorites' : 'Add to Favorites'}
                wide
                title={props.isFavorite ? 'Click to remove this page from Favorites' : 'Add this page to Favorites'}
                active={props.isFavorite}
                disabled={!props.hasPage}
                onClick={props.toggleFavorite}
              />
              <Btn icon={Ic.History} label="Page history" wide title="Earlier versions of this page" disabled={!props.hasPage} onClick={props.onHistory} />
            </Group>
          </>
        )}
      </div>
    </header>
  )
}

/**
 * Where a drop-down opens: just under its button, in window coordinates. (The ribbon panel
 * scrolls sideways on narrow windows, which would cut off a drop-down positioned inside it.)
 */
function popAt(wrap: HTMLElement | null, width = 300): React.CSSProperties {
  if (!wrap) return {}
  const r = wrap.getBoundingClientRect()
  return { top: r.bottom + 4, left: Math.max(4, Math.min(r.left, window.innerWidth - width - 8)) }
}

/** Whether the table around the cursor starts with a header row. */
function tableHasHeader(editor: Editor): boolean {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (n.type.name === 'table') return n.firstChild?.firstChild?.type.name === 'tableHeader'
  }
  return false
}

/** "Update pending" in the title bar once a new version is downloaded (and quietly while downloading). */
function UpdatePill({ onClick }: { onClick(): void }) {
  const u = useUpdateState()
  if (u.status === 'ready')
    return (
      <button className="update-pill" title={`Version ${u.version} is ready to install`} onClick={onClick}>
        <span className="dot" />
        Update pending
      </button>
    )
  if (u.status === 'downloading')
    return (
      <button className="update-pill quiet" title={`Downloading version ${u.version}`} onClick={onClick}>
        Downloading update… {u.percent ?? 0}%
      </button>
    )
  if (u.status === 'installing') return <span className="update-pill quiet">Installing update…</span>
  return null
}

/** Minimize / maximize / close, drawn by the app since the system title bar is hidden. */
function WindowButtons() {
  const wc = window.wiki.windowControls
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    void wc.isMaximized().then(setMaximized)
    return wc.onMaximizedChange(setMaximized)
  }, [wc])
  return (
    <div className="window-buttons">
      <button className="win-btn" title="Minimize" aria-label="Minimize" onClick={wc.minimize}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 6.5h8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button className="win-btn" title={maximized ? 'Restore' : 'Maximize'} aria-label={maximized ? 'Restore' : 'Maximize'} onClick={wc.toggleMaximize}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
          {maximized ? (
            <>
              <rect x="2" y="3.5" width="6.5" height="6.5" />
              <path d="M4 3.5V2h6v6H8.5" />
            </>
          ) : (
            <rect x="2" y="2" width="8" height="8" />
          )}
        </svg>
      </button>
      <button className="win-btn close" title="Close" aria-label="Close" onClick={wc.close}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="m2.5 2.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  )
}

/** A ribbon button that drops down a list of pages (Recent / Favorites). */
function PageList({ label, icon, empty, pages, openPage }: { label: string; icon: React.ComponentType; empty: string; pages: string[]; openPage(key: string): void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="rb-pop-wrap" ref={wrap}>
      <Btn icon={icon} label={`${label} ▾`} active={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="rb-pop page-list" role="menu" aria-label={label} style={popAt(wrap.current, 280)}>
          {pages.length === 0 ? (
            <p className="muted small">{empty}</p>
          ) : (
            pages.map((k) => {
              const [nb, sec, page] = k.split('/')
              return (
                <button
                  key={k}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    openPage(k)
                  }}
                >
                  <span className="pl-name">{page}</span>
                  <span className="muted small">
                    {nb} › {sec}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

/** Color picker button (font color / highlight) with a drop-down palette. */
function Swatches({
  label,
  letter,
  highlight = false,
  disabled,
  current,
  colors,
  defaultLabel,
  onPick
}: {
  label: string
  letter: string
  highlight?: boolean
  disabled: boolean
  current: string | null
  colors: { name: string; value: string; swatch: string }[]
  defaultLabel: string
  onPick(value: string | null): void
}) {
  const [open, setOpen] = useState(false)
  // The button applies the last color used; the arrow opens the palette.
  const [last, setLast] = useState(colors[0])
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const pick = (c: { name: string; value: string; swatch: string } | null) => {
    setOpen(false)
    if (c) setLast(c)
    onPick(c ? c.value : null)
  }

  return (
    <div className="rb-swatch-wrap" ref={wrap}>
      <button
        className={`rb-swatch-btn${current ? ' active' : ''}`}
        title={`${label}: ${last.name}`}
        aria-label={`${label} ${last.name}`}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick(last)}
      >
        <span className={highlight ? 'hl-letter' : 'color-letter'} style={highlight ? { background: last.swatch } : undefined}>
          {letter}
        </span>
        <span className="swatch-bar" style={{ background: last.swatch }} />
      </button>
      <button className="rb-swatch-more" title={`${label} colors`} aria-label={`More ${label.toLowerCase()} colors`} aria-expanded={open} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>
        ▾
      </button>
      {open && (
        <div className="rb-palette" role="menu" aria-label={label} style={popAt(wrap.current, 170)}>
          <div className="palette-grid">
            {colors.map((c) => (
              <button
                key={c.name}
                role="menuitem"
                className={`palette-swatch${current === c.value ? ' selected' : ''}`}
                style={{ background: c.swatch }}
                title={c.name}
                aria-label={c.name}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
              />
            ))}
          </div>
          <button className="palette-default" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)}>
            {defaultLabel}
          </button>
        </div>
      )}
    </div>
  )
}

/** Insert ▸ Date & time: pick a format from a drop-down (Alt+Shift+D / Alt+Shift+T insert date / time). */
function DateButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="rb-pop-wrap" ref={wrap}>
      <Btn icon={Ic.Clock} label="Date & time ▾" wide disabled={!editor} title="Insert today's date or the time (Alt+Shift+D / Alt+Shift+T)" active={open} onClick={() => setOpen((o) => !o)} />
      {open && editor && (
        <div className="rb-pop page-list date-list" role="menu" aria-label="Date and time" style={popAt(wrap.current, 280)}>
          {dateFormats().map((d) => (
            <button
              key={d.id}
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false)
                insertDate(editor, d.id)
              }}
            >
              <span className="pl-name">{d.text}</span>
              <span className="muted small">
                {d.label}
                {d.id === 'long' ? ' · Alt+Shift+D' : d.id === 'time' ? ' · Alt+Shift+T' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
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
          style={popAt(wrap.current, 340)}
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
