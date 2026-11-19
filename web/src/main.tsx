import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { syncStatusBar } from './lib/theme'
import { applyCategoryColours, cachedCategoryColours } from './lib/categoryStyle'

syncStatusBar()
// Your saved category colours, before first paint.
applyCategoryColours(cachedCategoryColours())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
