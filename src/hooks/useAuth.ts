import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import { queryClient } from "@/providers/trpc";
import { clearTaxUnlock } from "@/lib/taxUnlock";

interface AuthUser {
  id: number;
  email: string | null;
  name: string | null;
  role: string | null;
  avatar: string | null;
  hasPersonalMode?: boolean | null;
  modePreference?: "business" | "personal" | null;
}

/** One owner check per page load (every component using useAuth shares it). */
let ownerCheckDone = false;

function getStoredUser(): AuthUser | null {
  try {
    const saved = localStorage.getItem("auth_user");
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);
  const hasSyncedRef = useRef(false);

  // An older saved session of the owner may lack the admin role: ask the server once per page load.
  // The server alone knows who the owner is (no personal email in the browser code).
  // Uses fetch directly to avoid tRPC hook issues
  useEffect(() => {
    if (ownerCheckDone || hasSyncedRef.current) return;
    if (!user?.email || user?.role === "admin") return;
    ownerCheckDone = true;
    hasSyncedRef.current = true;

    // Get fresh token from localStorage
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    // Call autoPromoteOwner endpoint directly
    fetch("/api/trpc/auth.autoPromoteOwner", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.result?.data?.success && !data.result?.data?.wasAlreadyAdmin) {
          // Update localStorage with admin role
          const updated = { ...user, role: "admin" };
          localStorage.setItem("auth_user", JSON.stringify(updated));
          setUser(updated);
          // Reload to apply changes
          window.location.reload();
        } else if (data.result?.data?.wasAlreadyAdmin) {
          // Sync localStorage with admin role
          const updated = { ...user, role: "admin" };
          localStorage.setItem("auth_user", JSON.stringify(updated));
          setUser(updated);
        }
      })
      .catch(() => {
        // Silently fail - user can still use the app
      });
  }, [user?.email]); // Only re-run if email changes

  const setAuthUser = useCallback((userData: AuthUser | null) => {
    if (userData) {
      localStorage.setItem("auth_user", JSON.stringify(userData));
    } else {
      localStorage.removeItem("auth_user");
      localStorage.removeItem("auth_token");
    }
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    clearTaxUnlock();
    hasSyncedRef.current = false;
    const token = localStorage.getItem("auth_token");
    const finish = () => {
      queryClient.clear();
      localStorage.removeItem("auth_user");
      localStorage.removeItem("auth_token");
      setUser(null);
      window.location.href = "/login";
    };
    // The session also lives in an HttpOnly cookie that JS can't delete:
    // ask the server to clear it, then clear local state either way.
    fetch("/api/trpc/auth.logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-auth-token": token } : {}),
      },
      body: JSON.stringify({}),
      credentials: "same-origin",
    })
      .catch(() => { /* offline: local logout still happens */ })
      .finally(finish);
  }, []);

  return useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isAdmin: user?.role === "admin",
      logout,
      setAuthUser,
    }),
    [user, logout, setAuthUser]
  );
}
