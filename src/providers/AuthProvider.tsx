// 📄 src/providers/AuthProvider.tsx

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../utils/supabase'
import type { Session, User } from '@supabase/supabase-js'
import { actions } from '../store';
import { closeDbManager } from '../services/db-manager';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isInitialized: boolean;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isInitialized: false,
  isLoading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isLoading, setIsLoading] = useState(true);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    let mounted = true;

    const cleanupAndReset = (userIdToClean?: string) => {
      console.log('[AuthProvider] Cleaning up session and resetting store.');
      if (userIdToClean) {
        closeDbManager(userIdToClean);
      }
      supabase.removeAllChannels(); 
      actions.resetStore();
      setUser(null);
      setSession(null);
    };

    setIsLoading(true);
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (mounted) {
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setIsInitialized(true);
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;

        setIsLoading(true);
        const newUserId = newSession?.user?.id;
        const currentUserId = userRef.current?.id;

        if (currentUserId && currentUserId !== newUserId) {
          cleanupAndReset(currentUserId);
        }

        setSession(newSession);
        setUser(newSession?.user ?? null);
        
        if (!isInitialized) {
          setIsInitialized(true);
        }
        setIsLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    user,
    session,
    isInitialized,
    isLoading,
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