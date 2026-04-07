"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { clearAuthCookies, persistAuth } from "@/lib/auth";
import type { User } from "@/types";

// Provide a safe storage for SSR/prerender to avoid "localStorage is not defined" errors
const createStorage = () =>
  typeof window === "undefined"
    ? {
        getItem: (_key: string) => null,
        setItem: (_key: string, _value: string) => {},
        removeItem: (_key: string) => {},
      }
    : localStorage;

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (payload: { user: User; accessToken: string; refreshToken: string }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: ({ user, accessToken, refreshToken }) => {
        persistAuth(accessToken, refreshToken, user);
        set({ user, accessToken, refreshToken });
      },
      logout: () => {
        clearAuthCookies();
        set({ user: null, accessToken: null, refreshToken: null });
      },
    }),
    {
      name: "college-auth-store",
      storage: createJSONStorage(createStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);
