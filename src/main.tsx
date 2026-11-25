import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { Toaster } from "@/components/ui/sonner"
import App from './App.tsx'
import { I18nProvider } from "@/i18n/I18nProvider"
import { oneToastAtATime } from "@/lib/oneToast"
import { reloadForNewVersion } from "@/lib/newVersion"

// One notification at a time: a new one replaces the one on screen.
oneToastAtATime()

// Installed on the home screen (iPhone "Agregar a inicio", or an installed web app): the page fills the whole
// screen, so it asks the phone for its safe areas (env(safe-area-inset-*)) and keeps the tab bar and sheets clear
// of the home bar at the bottom. In Safari or Chrome nothing changes.
if (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone) {
  const vp = document.querySelector('meta[name="viewport"]')
  const content = vp?.getAttribute("content") ?? ""
  if (vp && !content.includes("viewport-fit")) vp.setAttribute("content", `${content}, viewport-fit=cover`)
}

// Page changes that cross-fade (Link viewTransition): when the browser skips one (another tap while it runs,
// the tab hidden), its promise is rejected with "Transition was skipped". Nothing is wrong: keep it out of the console.
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason as { name?: string; message?: string } | undefined
  if (r?.name === "AbortError" && /transition was skipped/i.test(r.message ?? "")) e.preventDefault()
})

// A piece of code (or its styles) from an older version couldn't be downloaded (a tab opened before we published):
// reload once to get the new version. If it just did, the error screen takes over (src/components/ErrorBoundary.tsx).
window.addEventListener("vite:preloadError", (e) => {
  if (reloadForNewVersion()) e.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
      <TRPCProvider>
        <App />
        {/* The notices (owner chose "Cristal claro", 2026-11-25): light glass in the middle of the bottom, a colored dot
            and the words, no X and no timer line; it goes by itself, or with a swipe (down or to a side). Above whatever
            is fixed at the bottom (--toast-bottom in index.css); the assistant's bubble steps up over it on phones. */}
        <Toaster
          position="bottom-center"
          className="z-[9999]"
          offset={{ bottom: "var(--toast-bottom)" }}
          mobileOffset={{ bottom: "var(--toast-bottom)", left: 12, right: 12 }}
          visibleToasts={1}
          duration={6000}
          swipeDirections={["bottom", "left", "right"]}
          icons={{ success: <i className="pb-dot" data-tone="ok" />, error: <i className="pb-dot" data-tone="err" />, warning: <i className="pb-dot" data-tone="warn" />, info: <i className="pb-dot" data-tone="info" /> }}
        />
      </TRPCProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)
