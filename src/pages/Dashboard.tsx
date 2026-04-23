import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, FileText, Loader2, Trash2, Crown, Edit3, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Flame, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { exportScreenplayPDF } from "@/lib/screenplay-pdf";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PLAN_LIMITS, type Tier } from "@/lib/plan-limits";

interface Script {
  id: string;
  title: string;
  logline: string | null;
  genre: string | null;
  status: string;
  updated_at: string;
}

interface Payment {
  id: string;
  tier: string;
  amount: number;
  currency: string;
  status: "pending" | "successful" | "failed";
  external_reference: string | null;
  created_at: string;
}

const isTransientAuthAbort = (message?: string) =>
  !!message && (message.includes("Lock broken by another request") || message.includes("AbortError"));

const Dashboard = () => {
  const { user, tier, periodEnd } = useAuth();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Safe NSFW preview — purely presentational. Persisted per-browser.
  // Default OFF so explicit-themed text never appears unless the user opts in.
  const [nsfwPreview, setNsfwPreview] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("nsfw_preview") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("nsfw_preview", nsfwPreview ? "1" : "0");
  }, [nsfwPreview]);
  const mountedRef = useRef(true);

  const t: Tier = (tier ?? "free") as Tier;
  const limits = PLAN_LIMITS[t];

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = async (attempt = 0) => {
    if (!user) {
      if (mountedRef.current) {
        setScripts([]);
        setPayments([]);
        setLoading(false);
      }
      return;
    }

    if (mountedRef.current) setLoading(true);

    const scriptsRes = await supabase
      .from("scripts")
      .select("id, title, logline, genre, status, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    const paymentsRes = await supabase
      .from("payments")
      .select("id, tier, amount, currency, status, external_reference, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    const shouldRetry = attempt === 0 && [scriptsRes.error?.message, paymentsRes.error?.message].some(isTransientAuthAbort);

    if (shouldRetry) {
      window.setTimeout(() => {
        if (mountedRef.current) void load(1);
      }, 250);
      return;
    }

    if (!mountedRef.current) return;

    if (scriptsRes.error) {
      toast({ title: "Failed to load scripts", description: scriptsRes.error.message, variant: "destructive" });
    }

    if (paymentsRes.error && !isTransientAuthAbort(paymentsRes.error.message)) {
      toast({ title: "Failed to load payments", description: paymentsRes.error.message, variant: "destructive" });
    }

    setScripts((scriptsRes.data as Script[]) ?? []);
    setPayments((paymentsRes.data as Payment[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("scripts").delete().eq("id", deleteId);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else toast({ title: "Script deleted" });
    setDeleteId(null);
    load();
  };

  // Plan expiry math
  const daysLeft = periodEnd ? Math.ceil((new Date(periodEnd).getTime() - Date.now()) / 86400000) : null;
  const expiringSoon = t !== "free" && daysLeft !== null && daysLeft <= 7;
  const pendingPayment = payments.find((p) => p.status === "pending");
  const lastFailed = payments.find((p) => p.status === "failed");

  return (
    <Layout>
      <div className="container py-8 md:py-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-gradient-sunset text-secondary-foreground border-0 capitalize">
                <Crown className="h-3 w-3 mr-1" /> {tier ?? "free"} plan
              </Badge>
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-black">Your scripts</h1>
            <p className="text-muted-foreground mt-2">Pick up where you left off, or start something new.</p>
          </div>
          <Button asChild size="lg" className="bg-gradient-hero text-white border-0 hover:opacity-90 shadow-playful">
            <Link to="/dashboard/new"><Plus className="mr-2 h-5 w-5" /> New script</Link>
          </Button>
        </div>

        {/* 7-day expiry banner */}
        {expiringSoon && daysLeft !== null && daysLeft > 0 && (
          <Card className="p-4 mb-4 border-destructive/40 bg-destructive/5 flex flex-wrap items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">
                Your <span className="capitalize">{tier}</span> plan ends in {daysLeft} day{daysLeft === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-muted-foreground">
                Renew before {new Date(periodEnd!).toLocaleDateString()} to keep your benefits — otherwise you'll be moved to Free automatically.
              </p>
            </div>
            <Button asChild size="sm" className="bg-gradient-hero text-white border-0">
              <Link to="/pricing">Renew now</Link>
            </Button>
          </Card>
        )}

        {/* Plan & payment status banners */}
        <div className="grid md:grid-cols-2 gap-3 mb-6">
          <Card className="p-4 bg-gradient-card border-border/60">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Current plan</p>
                <p className="font-display text-2xl font-bold capitalize">{limits.label}</p>
              </div>
              {t === "free" ? (
                <Button asChild size="sm" className="bg-gradient-hero text-white border-0">
                  <Link to="/pricing">Upgrade</Link>
                </Button>
              ) : (
                <Badge variant={expiringSoon ? "destructive" : "secondary"} className="gap-1">
                  <Clock className="h-3 w-3" />
                  {daysLeft !== null && daysLeft > 0 ? `${daysLeft}d left` : "Expired"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {limits.pages} pages · {limits.acts} acts{limits.allowSeries ? ` · up to ${limits.episodes} episodes` : ""}
            </p>
            {expiringSoon && (
              <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Renew soon — you'll move to Free when this period ends.
              </p>
            )}
          </Card>

          <Card className="p-4 bg-gradient-card border-border/60">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Payment status</p>
            {pendingPayment ? (
              <div className="flex items-start gap-2">
                <Clock className="h-5 w-5 text-secondary-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Awaiting verification</p>
                  <p className="text-xs text-muted-foreground">
                    {pendingPayment.currency} {Number(pendingPayment.amount).toFixed(2)} · ref{" "}
                    <span className="font-mono">{pendingPayment.external_reference}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Submitted {new Date(pendingPayment.created_at).toLocaleString()}</p>
                </div>
              </div>
            ) : payments[0]?.status === "successful" ? (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Payment approved</p>
                  <p className="text-xs text-muted-foreground">Your {payments[0].tier} plan is active.</p>
                </div>
              </div>
            ) : lastFailed ? (
              <div className="flex items-start gap-2">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Last payment rejected</p>
                  <p className="text-xs text-muted-foreground">Need help? Use the chat in the bottom right.</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            )}
          </Card>
        </div>

        {/* Safe NSFW preview toggle — shows what mature content looks like without revealing explicit text */}
        <Card className="p-4 md:p-5 mb-6 bg-gradient-card border-border/60">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`mt-0.5 h-9 w-9 rounded-lg grid place-items-center shrink-0 ${nsfwPreview ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                <Flame className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-base font-bold">Safe NSFW preview</p>
                  <Badge variant="secondary" className="text-[10px] gap-1"><ShieldCheck className="h-3 w-3" /> Safe-for-work</Badge>
                  <Badge variant="outline" className="text-[10px]">18+ opt-in</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  See what mature scripts <em>look like</em> on Scriptoon — without explicit text. Toggle on to reveal a slightly more descriptive (still safe) example. Generated NSFW scenes only ever appear inside your own scripts when you opt in at generation time.
                </p>
              </div>
            </div>
            <Switch
              checked={nsfwPreview}
              onCheckedChange={setNsfwPreview}
              aria-label="Toggle safe NSFW preview"
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            {[
              {
                tag: "Sensual",
                safe: "A charged glance across a dim hotel bar. He sets his glass down. She doesn't move.",
                hint: "Slow-burn intimacy framed through subtext, body language, and what is NOT said.",
              },
              {
                tag: "Graphic violence",
                safe: "Tires scream. Glass becomes weather. Two strangers learn each other's names through bruises.",
                hint: "Consequence-driven action — every wound costs the character something later.",
              },
              {
                tag: "Strong language",
                safe: "She tells him exactly where to go and which route to take. He laughs. It's not funny.",
                hint: "Profanity used as character voice, not shock — sparingly, and always in-character.",
              },
            ].map((ex) => (
              <div key={ex.tag} className="rounded-xl border border-border/60 bg-background/40 p-3">
                <Badge variant="outline" className="text-[10px] mb-2">{ex.tag}</Badge>
                <p className="text-sm leading-snug">{ex.safe}</p>
                {nsfwPreview ? (
                  <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
                    <Eye className="h-3 w-3 mt-0.5 shrink-0" /> {ex.hint}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                    <EyeOff className="h-3 w-3 shrink-0" /> Toggle on to see how this scene is approached.
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> No explicit text shown here — ever.</span>
            <span>Free: 1/24h NSFW · Pro: 3/24h · Premium: unlimited.</span>
            <Link to="/dashboard/new" className="text-primary underline">Try the NSFW switch in the generator →</Link>
          </div>
        </Card>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : scripts.length === 0 ? (
          <Card className="p-12 text-center bg-gradient-card border-dashed border-2">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-display text-2xl font-bold mb-2">No scripts yet</h3>
            <p className="text-muted-foreground mb-6">Generate your first screenplay in under a minute.</p>
            <Button asChild className="bg-gradient-hero text-white border-0 hover:opacity-90">
              <Link to="/dashboard/new"><Plus className="mr-2 h-4 w-4" /> Create script</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {scripts.map((s, i) => (
              <Card
                key={s.id}
                className="p-5 bg-gradient-card border-border/60 hover:shadow-playful hover:-translate-y-1 transition-all duration-300 animate-fade-in flex flex-col"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-hero text-white shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  {s.genre && <Badge variant="secondary" className="capitalize">{s.genre}</Badge>}
                </div>
                <h3 className="font-display text-xl font-bold mb-1 line-clamp-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1">
                  {s.logline ?? "No logline yet."}
                </p>
                <div className="flex items-center gap-2 mt-auto">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to={`/dashboard/scripts/${s.id}`}><Edit3 className="mr-1 h-4 w-4" /> Open</Link>
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(s.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this script?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. All versions will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Dashboard;
