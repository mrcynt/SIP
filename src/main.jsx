import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Menghidupkan Service Worker agar aplikasi bisa di-install & offline
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('Ada pembaruan aplikasi SIGMA versi terbaru. Muat ulang sekarang?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('Aplikasi SIGMA siap digunakan secara offline!')
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)