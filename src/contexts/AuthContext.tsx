import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

  const loadMeta = async (uid: string) => {
    const [{ data: roles }, { data: sub }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("subscriptions").select("tier, current_period_end").eq("user_id", uid).maybeSingle(),
    ]);
    const isAdmin = roles?.some((r) => r.role === "admin");
    setRole(isAdmin ? "admin" : "user");
    setTier((sub?.tier as any) ?? "free");
    setPeriodEnd((sub as any)?.current_period_end ?? null);
  };

  const refresh = async () => {
    if (user) await loadMeta(user.id);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadMeta(s.user.id), 0);
      } else {
        setRole(null);
        setTier(null);
        setPeriodEnd(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadMeta(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
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
