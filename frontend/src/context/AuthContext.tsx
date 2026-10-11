import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getAuthToken, setAuthToken, removeAuthToken } from '../api/client';

export interface User {
  id: string;
  username: string;
  role: 'ADMIN' | 'HOD' | 'FACULTY' | 'STUDENT' | 'PRINCIPAL';
  email: string;
  fullName: string;
  departmentId: string | null;
  facultyId?: string | null;
  studentId?: string | null;
  dept_name?: string | null;
  dept_code?: string | null;
  faculty?: any;
  student?: any;
  profileCompleted?: boolean;
  /** True until a provisioned account (e.g. Principal) sets its own password. */
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { username: string; password: string }) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  changePassword: (passwords: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(u: User | null): User | null {
  if (!u) return null;
  if (u.role === 'ADMIN' && (!u.fullName || u.fullName.includes('Balasubramanian') || u.fullName === 'System Administrator')) {
    return { ...u, fullName: 'System admin' };
  }
  if (u.fullName && u.fullName.includes('Balasubramanian')) {
    return { ...u, fullName: 'System admin' };
  }
  return u;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(getAuthToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const res = await api.auth.me();
      if (res.success && res.data) {
        setUser(normalizeUser(res.data));
      } else {
        logout();
      }
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode ?? 0;
      if (statusCode === 401 || statusCode === 403) {
        logout();
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      refreshUser();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (credentials: { username: string; password: string }): Promise<User> => {
    // Deliberately does NOT toggle the app-wide `isLoading` gate. That gate swaps
    // the entire tree for the boot screen (App.tsx), which unmounts the login page
    // and discards its local `error` state — so a rejected sign-in showed no
    // message at all. The login button keeps its own local loading state.
    const res = await api.auth.login(credentials);
    if (res.success && res.data) {
      setAuthToken(res.data.token);
      setTokenState(res.data.token);
      const normalized = normalizeUser(res.data.user)!;
      setUser(normalized);
      return normalized;
    }
    throw new Error(res.message || 'Login failed.');
  };

  const logout = () => {
    removeAuthToken();
    setTokenState(null);
    setUser(null);
  };

  /**
   * Change the signed-in user's password and adopt the freshly issued token.
   * The backend returns a token whose `mustChangePassword` claim is cleared, so
   * swapping it in lifts the first-login gate immediately and the old token
   * (still flagged) can no longer reach any protected route.
   */
  const changePassword = async (passwords: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<User> => {
    const res = await api.auth.changePassword(passwords);
    if (res.success && res.data) {
      setAuthToken(res.data.token);
      setTokenState(res.data.token);
      const normalized = normalizeUser(res.data.user)!;
      setUser(normalized);
      return normalized;
    }
    throw new Error(res.message || 'Password change failed.');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
