import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { BankProvider } from './contexts/BankContext.tsx'
import { SettingsProvider } from './contexts/SettingsContext.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <BankProvider>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </BankProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
