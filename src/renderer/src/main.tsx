import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// Apply the saved theme before the first paint (dark unless the user picked light).
try {
  document.documentElement.dataset.theme = JSON.parse(localStorage.getItem('jn.theme') ?? '"dark"') === 'light' ? 'light' : 'dark'
} catch {
  document.documentElement.dataset.theme = 'dark'
}

// The whiteboard's fonts are bundled with the app (see scripts/copy-excalidraw-fonts.mjs)
// instead of being downloaded from the internet.
;(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH =
  window.location.protocol === 'file:' ? 'jn-asset://excalidraw/' : new URL('./excalidraw/', window.location.href).href

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
