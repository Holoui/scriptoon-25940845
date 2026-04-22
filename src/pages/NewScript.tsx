import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Wand2, Lock, Flame } from "lucide-react";
import { PLAN_LIMITS, wordOptionsForTier, type Tier } from "@/lib/plan-limits";
import { USAGE_KINDS } from "@/lib/usage";

const GENRES = ["Romance", "Thriller", "Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Fantasy", "Mystery", "Adventure", "LGBTQ+"];
const TONES = ["Light & playful", "Dark & gritty", "Heartwarming", "Suspenseful", "Quirky & offbeat", "Epic & cinematic", "Satirical"];

const NSFW_LIMITS: Record<Tier, number> = { free: 1, pro: 3, premium: Infinity };

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const fmtNum = (n: number) => n.toLocaleString();

const NewScript = () => {
  const navigate = useNavigate();
  const { user, tier } = useAuth();
  const t: Tier = (tier ?? "free") as Tier;
  const limits = PLAN_LIMITS[t];
  const [loading, setLoading] = useState(false);
  const [usedToday, setUsedToday] = useState<number>(0);
  const [retryAt, setRetryAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [nsfwUsed, setNsfwUsed] = useState<number>(0);
  const [nsfwRetryAt, setNsfwRetryAt] = useState<Date | null>(null);

  const wordChoices = useMemo(() => wordOptionsForTier(t), [t]);
  const defaultWords = useMemo(() => Math.min(6000, limits.words), [limits.words]);

  const [form, setForm] = useState({
    genre: "",
    tone: "",
    characters: "",
    plot_idea: "",
    format: "movie" as "movie" | "series",
    acts: 3,
    episodes: 2,
    words: defaultWords,
    nsfw: false,
  });

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const actOptions = useMemo(() => range(limits.acts), [limits.acts]);
  const episodeOptions = useMemo(() => range(limits.episodes), [limits.episodes]);

  // Load rolling 24-hour generation count
  useEffect(() => {
    (async () => {
      if (!user) return;
      const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [{ data: gens }, { data: nsfwEvents }] = await Promise.all([
        supabase
          .from("script_generations")
          .select("created_at")
          .eq("user_id", user.id)
          .gte("created_at", windowStart.toISOString())
          .order("created_at", { ascending: true }),
        supabase
          .from("usage_events")
          .select("created_at")
          .eq("user_id", user.id)
          .eq("kind", USAGE_KINDS.nsfwGeneration)
          .gte("created_at", windowStart.toISOString())
          .order("created_at", { ascending: true }),
      ]);
      const used = gens?.length ?? 0;
      setUsedToday(used);
      if (isFinite(limits.dailyGenerations) && used >= limits.dailyGenerations && gens?.[0]) {
        setRetryAt(new Date(new Date(gens[0].created_at).getTime() + 24 * 60 * 60 * 1000));
      }
      const nsfwCount = nsfwEvents?.length ?? 0;
      setNsfwUsed(nsfwCount);
      const nsfwLimit = NSFW_LIMITS[t];
      if (isFinite(nsfwLimit) && nsfwCount >= nsfwLimit && nsfwEvents?.[0]) {
        setNsfwRetryAt(new Date(new Date(nsfwEvents[0].created_at).getTime() + 24 * 60 * 60 * 1000));
      }
    })();
  }, [user, limits.dailyGenerations, t]);

  // Tick every second when locked out so countdown updates
  useEffect(() => {
    if (!retryAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [retryAt]);

  const dailyLimit = limits.dailyGenerations;
  const unlimited = !isFinite(dailyLimit);
  const remaining = unlimited ? Infinity : Math.max(0, dailyLimit - usedToday);
  const cooldownMs = retryAt ? Math.max(0, retryAt.getTime() - now) : 0;
  const blocked = !unlimited && (remaining <= 0 || cooldownMs > 0);

  const formatCooldown = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.plot_idea.trim()) {
      toast({ title: "Plot idea required", variant: "destructive" });
      return;
    }
    if (blocked) {
      const desc = cooldownMs > 0
        ? `You've used all ${dailyLimit} of your daily generations. Try again in ${formatCooldown(cooldownMs)} or upgrade your plan.`
        : `Your ${t} plan allows ${dailyLimit} script(s) every 24 hours. Upgrade for more.`;
      toast({ title: "Daily limit reached", description: desc, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        genre: form.genre,
        tone: form.tone,
        characters: form.characters,
        plot_idea: form.plot_idea,
        format: form.format,
        acts: form.acts,
        words: form.words,
        episodes: form.format === "series" ? form.episodes : undefined,
      };
      const { data, error } = await supabase.functions.invoke("generate-script", { body: payload });
      if (error) throw error;
      if (data?.error) {
        if (data.rate_limited && data.retry_at) {
          setRetryAt(new Date(data.retry_at));
          setUsedToday(data.used ?? usedToday);
        }
        throw new Error(data.error);
      }
      toast({ title: "Script ready!", description: data.title });
      navigate(`/dashboard/scripts/${data.id}`);
    } catch (err: any) {
      toast({ title: "Couldn't generate script", description: err?.message ?? "Generation failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container py-8 md:py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/30 border border-secondary/40 text-sm font-medium mb-4">
              <Sparkles className="h-4 w-4 text-primary" /> AI-powered
            </span>
            <h1 className="font-display text-4xl md:text-5xl font-black mb-2">Describe your story</h1>
            <p className="text-muted-foreground">The more detail, the more magic.</p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <Badge variant="secondary" className="capitalize">
                {t} plan · up to {fmtNum(limits.words)} words · {limits.acts} acts{limits.allowSeries ? ` · ${limits.episodes} episodes` : ""}
              </Badge>
              <Badge variant={blocked ? "destructive" : "outline"}>
                {unlimited
                  ? "Unlimited generations"
                  : cooldownMs > 0
                  ? `Locked · retry in ${formatCooldown(cooldownMs)}`
                  : `${remaining}/${dailyLimit} left in next 24h`}
              </Badge>
            </div>
          </div>

          <Card className="p-6 md:p-8 bg-gradient-card border-border/60 shadow-soft">
            <form onSubmit={handleGenerate} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Genre</Label>
                  <Select value={form.genre} onValueChange={(v) => update("genre", v)}>
                    <SelectTrigger><SelectValue placeholder="Pick a genre" /></SelectTrigger>
                    <SelectContent>
                      {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <Select value={form.tone} onValueChange={(v) => update("tone", v)}>
                    <SelectTrigger><SelectValue placeholder="Pick a tone" /></SelectTrigger>
                    <SelectContent>
                      {TONES.map((tn) => <SelectItem key={tn} value={tn}>{tn}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Format</Label>
                <RadioGroup
                  value={form.format}
                  onValueChange={(v) => update("format", v as "movie" | "series")}
                  className="grid sm:grid-cols-2 gap-3"
                >
                  <label className="flex items-start gap-3 rounded-xl border border-border/60 p-3 cursor-pointer hover:bg-muted/40">
                    <RadioGroupItem value="movie" id="fmt-movie" className="mt-1" />
                    <div>
                      <p className="font-semibold">Full movie</p>
                      <p className="text-xs text-muted-foreground">One continuous screenplay.</p>
                    </div>
                  </label>
                  <label className={`flex items-start gap-3 rounded-xl border border-border/60 p-3 ${limits.allowSeries ? "cursor-pointer hover:bg-muted/40" : "opacity-60 cursor-not-allowed"}`}>
                    <RadioGroupItem value="series" id="fmt-series" disabled={!limits.allowSeries} className="mt-1" />
                    <div>
                      <p className="font-semibold flex items-center gap-1">Film series {!limits.allowSeries && <Lock className="h-3 w-3" />}</p>
                      <p className="text-xs text-muted-foreground">{limits.allowSeries ? "Multiple episodes." : "Upgrade to unlock."}</p>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              <div className={`grid gap-4 ${form.format === "series" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                <div className="space-y-2">
                  <Label>Acts / chapters</Label>
                  <Select value={String(form.acts)} onValueChange={(v) => update("acts", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {actOptions.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Target word count</Label>
                  <Select value={String(form.words)} onValueChange={(v) => update("words", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {wordChoices.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {fmtNum(n)} words · ~{Math.round(n / 230)} pages
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.format === "series" && (
                  <div className="space-y-2">
                    <Label>Episodes</Label>
                    <Select value={String(form.episodes)} onValueChange={(v) => update("episodes", Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {episodeOptions.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="characters">Main characters</Label>
                <Textarea
                  id="characters"
                  rows={3}
                  placeholder="e.g. Maya — a 28-year-old jazz pianist hiding a secret. Leo — her bandmate and rival."
                  value={form.characters}
                  onChange={(e) => update("characters", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plot">Plot idea *</Label>
                <Textarea
                  id="plot"
                  rows={5}
                  required
                  placeholder="A struggling pianist stumbles on a rival's lost composition the night before a make-or-break audition."
                  value={form.plot_idea}
                  onChange={(e) => update("plot_idea", e.target.value)}
                />
              </div>

              {blocked && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-center space-y-1">
                  <p className="text-sm font-semibold text-destructive flex items-center justify-center gap-2">
                    <Lock className="h-4 w-4" /> Daily limit reached
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You've used all {dailyLimit} of your {t} plan's generations in the last 24 hours.
                  </p>
                  {cooldownMs > 0 ? (
                    <p className="text-xs">
                      Try again in <span className="font-mono font-semibold text-foreground">{formatCooldown(cooldownMs)}</span>{" "}
                      or <a href="/pricing" className="text-primary underline">upgrade your plan</a> for more.
                    </p>
                  ) : (
                    <p className="text-xs">
                      <a href="/pricing" className="text-primary underline">Upgrade your plan</a> to keep generating.
                    </p>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full bg-gradient-hero text-white border-0 hover:opacity-90 h-12 text-base shadow-playful" disabled={loading || blocked}>
                {loading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Crafting your screenplay…</>
                ) : (
                  <><Wand2 className="mr-2 h-5 w-5" /> Generate screenplay</>
                )}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default NewScript;
