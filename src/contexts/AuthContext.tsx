import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth } from '@/config/firebase';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      setUser(user);
      setIsLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
