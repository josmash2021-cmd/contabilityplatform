import { useState } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../api/router";
import { getLang } from "@/i18n/lang";
import { getTaxUnlock } from "@/lib/taxUnlock";

// The session token lasts 30 days, but the app decides "logged in" from localStorage.
// When the token expires every request fails with UNAUTHORIZED and pages showed empty
// data or the paywall (even to admins). Send the user back to log in instead.
function handleUnauthorized(error: unknown) {
  if (!(error instanceof TRPCClientError) || error.data?.code !== "UNAUTHORIZED") return;
  try {
    if (!localStorage.getItem("auth_user")) return; // already logged out: nothing to do
    localStorage.removeItem("auth_user");
    localStorage.removeItem("auth_token");
  } catch { /* storage unavailable */ }
  if (window.location.pathname !== "/login") window.location.href = "/login?expired=1";
}

// The app's one client, shared by every page (not a component).
// eslint-disable-next-line react-refresh/only-export-components
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleUnauthorized }),
  mutationCache: new MutationCache({ onError: handleUnauthorized }),
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
      gcTime: 5 * 60 * 1000,
    },
  },
});

// The app's one client, shared by every page (not a component).
// eslint-disable-next-line react-refresh/only-export-components
export const trpc = createTRPCReact<AppRouter>();

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          headers({ opList }) {
            // x-lang lets the server answer in the user's language (es/en).
            const headers: Record<string, string> = { "x-lang": getLang() };
            const token = localStorage.getItem("auth_token");
            if (token) headers["x-auth-token"] = token;
            // Impuestos, once opened with the code in this tab (api/lib/taxGate.ts).
            const unlock = getTaxUnlock();
            if (unlock && opList.some((op) => op.path.startsWith("tax."))) headers["x-tax-unlock"] = unlock;
            return headers;
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
