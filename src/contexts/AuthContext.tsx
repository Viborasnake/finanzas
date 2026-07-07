import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
  loading: boolean;
  isPaused: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  signOut: async () => {},
  loading: true,
  isPaused: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const checkUserStatus = async (currentUser: User | null) => {
      if (!currentUser) {
        setIsPaused(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('profiles')
          .select('status')
          .eq('id', currentUser.id)
          .maybeSingle();
        
        if (data && data.status === 'paused') {
          setIsPaused(true);
        } else {
          setIsPaused(false);
        }
      } catch (err) {
        console.error("Error checking user profile status:", err);
        setIsPaused(false);
      }
    };

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      checkUserStatus(currentUser).then(() => {
        setLoading(false);
      });
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      checkUserStatus(currentUser).then(() => {
        setLoading(false);
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, signOut, loading, isPaused }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
