import { useCallback, useState, useMemo } from "react";
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
    queryClient.clear();
    localStorage.removeItem("auth_user");
    localStorage.removeItem("auth_token");
    setUser(null);
    // or we can reload to clear it
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
