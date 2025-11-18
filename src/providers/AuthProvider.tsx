// 📄 src/providers/AuthProvider.tsx

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../utils/supabase'
import type { Session, User } from '@supabase/supabase-js'
import { actions } from '../store';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isInitialized: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isInitialized: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  
  const cleanupAndReset = useCallback(() => {
    console.log('[AuthProvider] Cleaning up session and resetting store.');
    supabase.removeAllChannels(); 
    actions.resetStore();
    setUser(null);
    setSession(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (mounted) {
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setIsInitialized(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;

        const currentUser = newSession?.user ?? null;

        if (user?.id !== currentUser?.id) {
          cleanupAndReset();
        }
        
        setSession(newSession);
        setUser(currentUser);

        if (!isInitialized) {
          setIsInitialized(true);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };

  }, [cleanupAndReset, isInitialized, user]);

  const value = {
    user,
    session,
    isInitialized,
  };

  return <AuthContext.Provider value={value}>{isInitialized ? children : null}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};