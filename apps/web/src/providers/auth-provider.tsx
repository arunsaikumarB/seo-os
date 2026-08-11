import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getWebAuthMode, type WebAuthMode } from '@/lib/auth-mode';
import {
  clearLocalSession,
  readLocalSession,
  writeLocalSession,
} from '@/lib/local-auth-session';

interface AuthContextValue {
  authMode: WebAuthMode;
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type LocalAuthResponse = {
  data: {
    access_token: string;
    user: { id: string; email: string; fullName: string };
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const authMode = getWebAuthMode();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authMode === 'local') {
      setSession(readLocalSession());
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, [authMode]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (authMode === 'local') {
        try {
          const res = await apiFetch<LocalAuthResponse>('/v1/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          setSession(writeLocalSession(res.data.access_token, res.data.user));
        } catch (err) {
          throw new Error(getApiErrorMessage(err, 'Sign in failed'));
        }
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    [authMode]
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      if (authMode === 'local') {
        try {
          const res = await apiFetch<LocalAuthResponse>('/v1/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password, fullName }),
          });
          setSession(writeLocalSession(res.data.access_token, res.data.user));
        } catch (err) {
          throw new Error(getApiErrorMessage(err, 'Sign up failed'));
        }
        return;
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;
    },
    [authMode]
  );

  const signInWithGoogle = useCallback(async () => {
    if (authMode === 'local') {
      throw new Error('Google sign-in is not available in local auth mode');
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/projects` },
    });
    if (error) throw error;
  }, [authMode]);

  const signOut = useCallback(async () => {
    if (authMode === 'local') {
      clearLocalSession();
      setSession(null);
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, [authMode]);

  const getAccessToken = useCallback(async () => {
    if (authMode === 'local') {
      const local = readLocalSession();
      if (!local) {
        setSession(null);
        return null;
      }
      setSession(local);
      return local.access_token ?? null;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    let next = sessionData.session;
    if (!next) return null;

    const expiresAt = next.expires_at ?? 0;
    const expiresSoon = expiresAt * 1000 < Date.now() + 60_000;
    if (expiresSoon) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed.session) {
        next = refreshed.session;
        setSession(next);
      }
    }

    return next.access_token ?? null;
  }, [authMode]);

  const value = useMemo(
    () => ({
      authMode,
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      getAccessToken,
    }),
    [authMode, session, loading, signIn, signUp, signInWithGoogle, signOut, getAccessToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
