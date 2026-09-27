import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getAuthToken, setAuthToken, removeAuthToken } from '../api/client';

export interface User {
  id: string;
  username: string;
  role: 'ADMIN' | 'HOD' | 'FACULTY' | 'STUDENT';
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
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { username: string; password: string }) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
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
    } catch {
      logout();
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
    setIsLoading(true);
    try {
      const res = await api.auth.login(credentials);
      if (res.success && res.data) {
        setAuthToken(res.data.token);
        setTokenState(res.data.token);
        const normalized = normalizeUser(res.data.user)!;
        setUser(normalized);
        return normalized;
      }
      throw new Error(res.message || 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    removeAuthToken();
    setTokenState(null);
    setUser(null);
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
