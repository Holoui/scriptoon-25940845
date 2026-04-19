import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type Role = "admin" | "user";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role | null;
  tier: "free" | "pro" | "premium" | null;
  periodEnd: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [tier, setTier] = useState<"free" | "pro" | "premium" | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Track which user id we last loaded meta for to avoid redundant refetches
  // on TOKEN_REFRESHED / window focus events, which were causing UI glitches.
  const loadedForUserId = useRef<string | null>(null);

  const loadMeta = async (uid: string) => {
    try {
      const [{ data: roles }, { data: sub }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("subscriptions").select("tier, current_period_end").eq("user_id", uid).maybeSingle(),
      ]);
      const isAdmin = roles?.some((r) => r.role === "admin");
      setRole(isAdmin ? "admin" : "user");
      setTier((sub?.tier as any) ?? "free");
      setPeriodEnd((sub as any)?.current_period_end ?? null);
      loadedForUserId.current = uid;
    } catch (err) {
      // Network / transient error — do NOT sign the user out. Just keep
      // whatever state we had and let the next event try again.
      console.warn("[auth] loadMeta failed", err);
    }
  };

  const refresh = async () => {
    if (user) {
      loadedForUserId.current = null;
      await loadMeta(user.id);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1. Set up the listener FIRST (synchronous-only callback work).
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        // Only refetch metadata when the user actually changed (sign-in /
        // user switch). TOKEN_REFRESHED and SIGNED_IN-with-same-user fire
        // frequently (e.g. on tab focus) and would otherwise cause a
        // visible re-render storm and glitches.
        if (loadedForUserId.current !== s.user.id) {
          setTimeout(() => {
            if (mounted) loadMeta(s.user!.id);
          }, 0);
        }
      } else {
        setRole(null);
        setTier(null);
        setPeriodEnd(null);
        loadedForUserId.current = null;
      }
    });

    // 2. THEN check the existing session.
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadMeta(s.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user, session, role, tier, periodEnd, loading, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
