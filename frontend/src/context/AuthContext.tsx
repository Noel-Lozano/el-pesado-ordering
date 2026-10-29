"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import { setUnauthorizedHandler } from "@/lib/api";

// The JWT from the OTP flow, kept in localStorage for the MVP. This is an
// accepted tradeoff (ADR-002 decision 6): frontend and API are on different
// domains, which makes httpOnly cookies impractical until a custom domain exists.

export const AUTH_STORAGE_KEY = "elpesado.auth.v1";

interface AuthState {
  token: string | null;
  // E.164; the token itself only carries customerId.
  phone: string | null;
  hasLoaded: boolean;
}

type AuthAction = { type: "load"; token: string | null; phone: string | null } | { type: "clear" };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "load":
      return { token: action.token, phone: action.phone, hasLoaded: true };
    case "clear":
      return { ...state, token: null, phone: null };
  }
}

function loadStoredAuth(): { token: string | null; phone: string | null } {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) ?? "null");
    if (typeof parsed === "object" && parsed !== null) {
      const { token, phone } = parsed as Record<string, unknown>;
      if (typeof token === "string" && typeof phone === "string") {
        return { token, phone };
      }
    }
  } catch {
    // Corrupt or blocked storage: treat as signed out.
  }
  return { token: null, phone: null };
}

function saveStoredAuth(token: string | null, phone: string | null): void {
  try {
    if (token && phone) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, phone }));
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // Storage blocked: auth lasts for this page view only.
  }
}

interface AuthContextValue {
  token: string | null;
  phone: string | null;
  hasLoaded: boolean;
  setToken: (token: string, phone: string) => void;
  clear: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(authReducer, { token: null, phone: null, hasLoaded: false });

  // Read after mount for the same hydration reason as the cart.
  useEffect(() => {
    const stored = loadStoredAuth();
    dispatch({ type: "load", token: stored.token, phone: stored.phone });
  }, []);

  const clear = useCallback(() => {
    saveStoredAuth(null, null);
    dispatch({ type: "clear" });
  }, []);

  // Any 401 means the token expired or is invalid: drop it and send the
  // customer back to checkout to re-verify. The cart is left untouched.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
      router.push("/checkout");
    });
    return () => setUnauthorizedHandler(null);
  }, [clear, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: state.token,
      phone: state.phone,
      hasLoaded: state.hasLoaded,
      setToken: (token, phone) => {
        saveStoredAuth(token, phone);
        dispatch({ type: "load", token, phone });
      },
      clear,
    }),
    [state, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
