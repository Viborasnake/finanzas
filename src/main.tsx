import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { BankProvider } from './contexts/BankContext.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BankProvider>
        <App />
      </BankProvider>
    </AuthProvider>
  </React.StrictMode>,
)
