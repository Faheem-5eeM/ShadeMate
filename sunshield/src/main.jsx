import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// This file no longer imports any CSS.
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

