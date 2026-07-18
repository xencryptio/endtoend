import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { googleLogout } from "@react-oauth/google";

export interface GoogleUser {
  sub: string;       // Google user ID
  email: string;
  name: string;
  picture: string;
  given_name: string;
  family_name?: string;
}

interface AuthContextType {
  user: GoogleUser | null;
  isAuthenticated: boolean;
  login: (credential: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "xencrypt_google_user";

/** Decode a Google JWT credential (id_token) without a library.
 *  The payload is a standard base64url-encoded JSON object. */
function decodeJwt(token: string): GoogleUser | null {
  try {
    const payload = token.split(".")[1];
    // base64url → base64 → decode
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json) as GoogleUser;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<GoogleUser | null>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as GoogleUser) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((credential: string) => {
    const decoded = decodeJwt(credential);
    if (decoded) {
      setUser(decoded);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(decoded));
    }
  }, []);

  const logout = useCallback(() => {
    googleLogout();
    setUser(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
