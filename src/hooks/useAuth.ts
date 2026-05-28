import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import { queryClient } from "@/providers/trpc";

interface AuthUser {
  id: number;
  email: string | null;
  name: string | null;
  role: string | null;
  avatar: string | null;
  hasPersonalMode?: boolean | null;
  modePreference?: "business" | "personal" | null;
}

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

  // Auto-promote owner to admin on first load
  // Uses fetch directly to avoid tRPC hook issues
  useEffect(() => {
    const OWNER_EMAIL = "josmash2021@gmail.com";
    if (hasSyncedRef.current) return;
    if (!user?.email || user?.role === "admin") return;
    if (user.email.toLowerCase() !== OWNER_EMAIL.toLowerCase()) return;

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
    hasSyncedRef.current = false;
    queryClient.clear();
    localStorage.removeItem("auth_user");
    localStorage.removeItem("auth_token");
    setUser(null);
    window.location.href = "/login";
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
