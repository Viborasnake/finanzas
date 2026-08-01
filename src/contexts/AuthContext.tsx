import React, { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { AuthContext } from './authContextValue';

const LEGACY_ADMIN_EMAIL = 'viborasnake@gmail.com';

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkUserStatus = async (currentUser: User | null) => {
      if (!currentUser) {
        setIsPaused(false);
        setIsAdmin(false);
        return;
      }

      const legacyAdminAccess = currentUser.email?.toLocaleLowerCase('es-CL') === LEGACY_ADMIN_EMAIL;
      try {
        const [profileResult, adminResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('status')
            .eq('id', currentUser.id)
            .maybeSingle(),
          supabase.rpc('is_current_user_admin')
        ]);

        if (profileResult.error) throw profileResult.error;
        
        setIsPaused(profileResult.data?.status === 'paused');

        if (adminResult.error) {
          setIsAdmin(Boolean(legacyAdminAccess));
          if (adminResult.error.code !== 'PGRST202') {
            console.error('Error checking admin access:', adminResult.error);
          }
        } else {
          setIsAdmin(Boolean(adminResult.data));
        }
      } catch (err) {
        console.error("Error checking user profile status:", err);
        setIsPaused(false);
        setIsAdmin(Boolean(legacyAdminAccess));
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
    <AuthContext.Provider value={{ session, user, signOut, loading, isPaused, isAdmin }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
