import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Notes from './Notes.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Notes />
  </StrictMode>,
)
