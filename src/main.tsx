import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { Toaster } from "@/components/ui/sonner"
import App from './App.tsx'
import { I18nProvider } from "@/i18n/I18nProvider"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
      <TRPCProvider>
        <App />
        <Toaster
          position="top-center"
          className="z-[9999] pt-6"
          richColors
          closeButton
        />
      </TRPCProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)
