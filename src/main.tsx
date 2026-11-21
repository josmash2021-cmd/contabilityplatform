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
        {/* Bottom right on computer and phone, above whatever is fixed at the bottom (--toast-bottom in index.css). */}
        <Toaster
          position="bottom-right"
          className="z-[9999]"
          offset={{ bottom: "var(--toast-bottom)", right: 24 }}
          mobileOffset={{ bottom: "var(--toast-bottom)", left: 12, right: 12 }}
          richColors
          closeButton
        />
      </TRPCProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)
