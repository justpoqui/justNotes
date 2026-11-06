// The Excalidraw canvas for one page, saved as <Page>.canvas.json next to the page.
// The file is only created once something is actually drawn.

import { Excalidraw, exportToBlob, hashElementsVersion, MainMenu, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { createPortal } from 'react-dom'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { clearActivePage, setActivePage, type BoardControls } from '../editor/activePage'
import { registerFlusher } from '../editor/saveCoordinator'
import type { WhiteboardProps } from './Whiteboard'

const SAVE_DELAY_MS = 800

type Scene = { elements: any[]; appState: Record<string, unknown>; files: Record<string, unknown> }

function parseScene(text: string): Scene {
  const data = JSON.parse(text)
  if (!data || typeof data !== 'object' || !Array.isArray(data.elements)) throw new Error('not a whiteboard file')
  return { elements: data.elements, appState: data.appState ?? {}, files: data.files ?? {} }
}

export default function WhiteboardCanvas({ notebook, section, page, theme, onError, statusSlot }: WhiteboardProps) {
  const [initial, setInitial] = useState<Scene | null>(null)
  const [broken, setBroken] = useState<string | null>(null)
  const [status, setStatus] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved')

  const api = useRef<ExcalidrawImperativeAPI | null>(null)
  const lastSaved = useRef<string | null>(null) // file contents as we last read/wrote them
  const pending = useRef<string | null>(null) // newest unsaved scene
  const lastKey = useRef<string | null>(null)
  const ignoreChanges = useRef(1) // skip Excalidraw's change events caused by loading
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inFlight = useRef<Promise<void>>(Promise.resolve())
  const controlsRef = useRef<BoardControls | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    let alive = true
    void window.wiki.readCanvas(notebook, section, page).then((r) => {
      if (!alive) return
      if (!r.ok) return setBroken(r.error.message)
      lastSaved.current = r.data
      if (r.data === null) return setInitial({ elements: [], appState: {}, files: {} })
      try {
        setInitial(parseScene(r.data))
      } catch {
        // Never overwrite a file we couldn't read.
        setBroken(`"${page}.canvas.json" could not be read, so the whiteboard is not shown (the file was left untouched).`)
      }
    })
    return () => {
      alive = false
    }
  }, [notebook, section, page])

  const save = useCallback((): Promise<void> => {
    clearTimeout(timer.current)
    const run = async () => {
      const json = pending.current
      if (json === null) return
      pending.current = null
      setStatus('saving')
      const previous = lastSaved.current
      lastSaved.current = json // set first so the file watcher recognises our own write
      const r = await window.wiki.writeCanvas(notebook, section, page, json)
      if (r.ok) setStatus(pending.current ? 'unsaved' : 'saved')
      else {
        lastSaved.current = previous
        if (pending.current === null) pending.current = json
        setStatus('error')
        onErrorRef.current(r.error.message)
      }
    }
    inFlight.current = inFlight.current.then(run, run)
    return inFlight.current
  }, [notebook, section, page])

  useEffect(() => registerFlusher(save), [save])
  useLayoutEffect(() => () => void save(), [save]) // leaving the page

  // Let the ribbon's Draw tab drive the canvas, once Excalidraw has finished starting up
  // (tools chosen before that are ignored by Excalidraw).
  const onApi = useCallback((a: ExcalidrawImperativeAPI) => {
    api.current = a
  }, [])
  const registerControls = useCallback(() => {
    const a = api.current
    if (!a || controlsRef.current) return
    const clickButton = (label: string) => (document.querySelector(`.excalidraw [aria-label="${label}"]`) as HTMLElement | null)?.click()
    const controls: BoardControls = {
      setTool: (tool) => a.setActiveTool({ type: tool } as any),
      activeTool: () => a.getAppState().activeTool.type,
      undo: () => clickButton('Undo'),
      redo: () => clickButton('Redo'),
      subscribe: (cb) => a.onChange(() => cb()),
      snapshot: async () => {
        const elements = a.getSceneElements()
        if (!elements.length) return null
        // Always a light picture (it goes into the page, which may be printed / exported).
        return exportToBlob({ elements, appState: { ...a.getAppState(), exportBackground: true, viewBackgroundColor: '#ffffff', exportWithDarkMode: false }, files: a.getFiles(), mimeType: 'image/png', exportPadding: 16 } as any)
      }
    }
    controlsRef.current = controls
    setActivePage({ board: controls })
  }, [])
  useEffect(() => () => clearActivePage({ board: controlsRef.current }), [])

  const onChange = useCallback((elements: readonly any[], appState: any, files: any) => {
    if (!controlsRef.current) requestAnimationFrame(registerControls)
    // onChange fires on every pointer move; only serialise when the content actually changed.
    const key = `${hashElementsVersion(elements)}|${Object.keys(files).length}|${appState.viewBackgroundColor}|${appState.gridModeEnabled}`
    if (key === lastKey.current) return
    lastKey.current = key
    if (ignoreChanges.current > 0) {
      ignoreChanges.current--
      return
    }
    pending.current = serializeAsJSON(elements, appState, files, 'local')
    setStatus('unsaved')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), SAVE_DELAY_MS)
  }, [save, registerControls])

  // Reload if another program changed the file and we have nothing unsaved.
  useEffect(
    () =>
      window.wiki.onChanged(async () => {
        const r = await window.wiki.readCanvas(notebook, section, page)
        if (!r.ok || r.data === null || r.data === lastSaved.current || pending.current !== null || !api.current) return
        try {
          const scene = parseScene(r.data)
          lastSaved.current = r.data
          ignoreChanges.current = 1
          if (Object.keys(scene.files).length) api.current.addFiles(Object.values(scene.files) as any)
          api.current.updateScene({ elements: scene.elements, appState: scene.appState as any })
        } catch {
          /* half-written by another program; the next change event will retry */
        }
      }),
    [notebook, section, page]
  )


  if (broken) return <p className="error-text board-error">{broken}</p>
  if (!initial) return <div className="board-loading">Loading whiteboard…</div>

  return (
    <div className="board">
      {statusSlot &&
        createPortal(
          <div className={`save-status ${status}`} aria-live="polite">
            {{ saved: 'Saved', unsaved: 'Editing…', saving: 'Saving…', error: 'Not saved' }[status]}
          </div>,
          statusSlot
        )}
      <Excalidraw
        excalidrawAPI={onApi}
        initialData={{ elements: initial.elements, appState: { ...initial.appState, theme }, files: initial.files as any, scrollToContent: true }}
        onChange={onChange}
        theme={theme}
        name={page}
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false, saveAsImage: true, clearCanvas: true, changeViewBackgroundColor: true }
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
    </div>
  )
}
