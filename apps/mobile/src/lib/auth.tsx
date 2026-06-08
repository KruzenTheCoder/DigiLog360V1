// Mobile auth — PIN login ONLY. We do NOT expose `signInWithPassword` here
// because the mobile app is intentionally PIN-first. If a user needs a
// password recovery path, they do that from the admin web console.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { MOBILE_ROLES, type Profile } from '@digilog/shared';

interface PinLoginInput {
  org_slug: string;
  pin: string;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInWithPin: (input: PinLoginInput) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile((data as unknown as Profile) ?? null);
    return data as unknown as Profile | null;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) loadProfile(newSession.user.id);
      else setProfile(null);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const enforceMobileRole = useCallback(async (userId: string): Promise<{ error?: string }> => {
    const prof = await loadProfile(userId);
    if (!prof?.is_active) {
      await supabase.auth.signOut();
      return { error: 'Your account is deactivated. Speak to your supervisor.' };
    }
    // Multi-role: ANY mobile role passes.
    const roles = Array.isArray(prof.roles) && prof.roles.length > 0 ? prof.roles : [prof.role];
    const ok = roles.some((r) => MOBILE_ROLES.includes(r));
    if (!ok) {
      await supabase.auth.signOut();
      return { error: 'This app is for field guards and supervisors. Use the web console.' };
    }
    return {};
  }, [loadProfile]);

  const signInWithPin = useCallback(async (input: PinLoginInput) => {
    try {
      const res = await supabase.functions.invoke<{
        token_hash: string; email: string; type: 'magiclink'; error?: string;
      }>('pin-login', {
        body: {
          org_slug: input.org_slug.trim().toLowerCase(),
          pin: input.pin,
        },
      });
      if (res.error) {
        // supabase-js wraps the body in res.error.context.Response; pull the
        // real error JSON so we surface "PIN must be 4 digits", "Invalid PIN",
        // edge function crash messages, etc. instead of the generic wrapper.
        let detail: string | null = null;
        try {
          const ctx = (res.error as unknown as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json() as { error?: string };
            if (body?.error) detail = body.error;
          }
        } catch { /* ignore — fall back to wrapper message */ }
        return { error: detail ?? res.error.message };
      }
      const payload = res.data;
      if (!payload?.token_hash) {
        return { error: payload?.error ?? 'PIN login failed' };
      }

      const { data: verified, error: vErr } = await supabase.auth.verifyOtp({
        token_hash: payload.token_hash,
        type: 'magiclink',
      });
      if (vErr || !verified.session) return { error: vErr?.message ?? 'PIN session failed' };
      return enforceMobileRole(verified.session.user.id);
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'PIN login failed' };
    }
  }, [enforceMobileRole]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, signInWithPin, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}
