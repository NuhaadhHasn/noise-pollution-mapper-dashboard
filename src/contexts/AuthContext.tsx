import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { safeStorage } from '@/lib/safeStorage';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * sec-4: the `role` field of the signed-in account's OWN users/{uid}
   * document. null when signed out, while loading, after a failed read, and
   * when the document or the field is missing. Only 'admin' opens the
   * dashboard (D1). It is granted manually (master M3), never by this app.
   */
  role: string | null;
  /** True from sign-in until the role read has answered. */
  roleLoading: boolean;
  /** The last role read failed (for example offline). Never treated as access. */
  roleError: Error | null;
  /** Read the role again (the no-access page's "Try again"). */
  retryRole: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/** One answer of the role read, tagged with the account and the request it answers. */
interface RoleAnswer {
  uid: string;
  request: number;
  role: string | null;
  error: Error | null;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // sec-4: every auth change and every retry bumps the request number. Only an
  // answer for the current account AND the current request counts, so a role
  // is never carried over to another account or to another sign-in.
  const [roleRequest, setRoleRequest] = useState(0);
  const [roleAnswer, setRoleAnswer] = useState<RoleAnswer | null>(null);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      setUser(user);
      setRoleRequest((request) => request + 1);
      setIsLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const uid = user ? user.uid : null;

  // sec-4: read the role from the caller's OWN profile. This is an owner get,
  // allowed by firestore.rules before and after 02.4, and a read: the browser
  // still writes nothing. State is set only in the promise callbacks.
  useEffect(() => {
    if (uid === null) {
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'users', uid))
      .then((snapshot) => {
        if (cancelled) {
          return;
        }
        // The 2 Auth-only accounts have no users doc; app-created docs have no role.
        const role: unknown = snapshot.exists() ? snapshot.get('role') : null;
        setRoleAnswer({
          uid,
          request: roleRequest,
          role: typeof role === 'string' ? role : null,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        console.error('[Auth] Could not read the dashboard role:', err);
        setRoleAnswer({
          uid,
          request: roleRequest,
          role: null,
          error: err instanceof Error ? err : new Error('Could not check dashboard access'),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [uid, roleRequest]);

  const currentRole =
    roleAnswer !== null && roleAnswer.uid === uid && roleAnswer.request === roleRequest
      ? roleAnswer
      : null;
  const roleLoading = uid !== null && currentRole === null;

  const retryRole = useCallback(() => {
    setRoleRequest((request) => request + 1);
  }, []);

  const signOut = async () => {
    // priv-4: builds before cluster 05 stored the login email under this key
    // and never read it back. Remove it so it does not outlive the session.
    // The readings cache is purged by the ReadingsProvider when `user` turns null.
    safeStorage.remove('remembered_email');
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
    role: currentRole ? currentRole.role : null,
    roleLoading,
    roleError: currentRole ? currentRole.error : null,
    retryRole,
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
