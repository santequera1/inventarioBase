import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Permission, User } from "@inventario/shared";
import { api, setUnauthorizedHandler } from "./api";

type Me = { user: User; permissions: Permission[] };

type AuthContextValue = {
  user: User | null;
  permissions: Permission[];
  loading: boolean;
  can: (p: Permission) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Me>("/api/auth/me"),
    retry: false,
    staleTime: 5 * 60_000,
  });

  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.setQueryData(["me"], null);
    });
  }, [qc]);

  const value = React.useMemo<AuthContextValue>(() => {
    const data = me.data ?? null;
    const perms = data?.permissions ?? [];
    return {
      user: data?.user ?? null,
      permissions: perms,
      loading: me.isLoading,
      can: (p) => perms.includes(p),
      login: async (email, password) => {
        const res = await api.post<Me>("/api/auth/login", { email, password });
        qc.setQueryData(["me"], res);
      },
      logout: async () => {
        await api.post("/api/auth/logout");
        qc.clear();
        qc.setQueryData(["me"], null);
      },
    };
  }, [me.data, me.isLoading, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}
