import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";

interface AuthState {
  email: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null as never);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ email: string }>("/auth/me").catch((e) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
    retry: false,
  });
  const login = async (email: string, password: string) => {
    await api("/auth/login", { method: "POST", json: { email, password } });
    await qc.invalidateQueries({ queryKey: ["me"] });
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    qc.clear();
    await qc.invalidateQueries({ queryKey: ["me"] });
  };
  return <Ctx value={{ email: me.data?.email ?? null, loading: me.isLoading, login, logout }}>{children}</Ctx>;
}
