import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Wand2, Lock } from "lucide-react";

const GENRES = ["Romance", "Thriller", "Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Fantasy", "Mystery", "Adventure"];
const TONES = ["Light & playful", "Dark & gritty", "Heartwarming", "Suspenseful", "Quirky & offbeat", "Epic & cinematic", "Satirical"];

type Tier = "free" | "pro" | "premium";

const LIMITS: Record<Tier, { pages: number; acts: number; episodes: number; allowSeries: boolean }> = {
  free:    { pages: 12,  acts: 2,  episodes: 2,  allowSeries: false },
  pro:     { pages: 60,  acts: 10, episodes: 6,  allowSeries: true  },
  premium: { pages: 150, acts: 50, episodes: 12, allowSeries: true  },
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

const NewScript = () => {
  const navigate = useNavigate();
  const { user, tier } = useAuth();
  const t: Tier = (tier ?? "free") as Tier;
  const limits = LIMITS[t];
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    genre: "",
    tone: "",
    characters: "",
    plot_idea: "",
    format: "movie" as "movie" | "series",
    acts: 3,
    episodes: 2,
    pages: Math.min(12, limits.pages),
  });

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const actOptions = useMemo(() => range(limits.acts), [limits.acts]);
  const episodeOptions = useMemo(() => range(limits.episodes), [limits.episodes]);
  const pageOptions = useMemo(() => {
    const set = new Set([5, 10, 12, 20, 30, 45, 60, 90, 120, 150].filter((p) => p <= limits.pages));
    set.add(limits.pages);
    return Array.from(set).sort((a, b) => a - b);
  }, [limits.pages]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.plot_idea.trim()) {
      toast({ title: "Plot idea required", variant: "destructive" });
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
        pages: form.pages,
        episodes: form.format === "series" ? form.episodes : undefined,
      };
      const { data, error } = await supabase.functions.invoke("generate-script", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
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
            <Badge variant="secondary" className="mt-3 capitalize">
              {t} plan · max {limits.pages} pages · {limits.acts} acts{limits.allowSeries ? ` · ${limits.episodes} episodes` : ""}
            </Badge>
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
                  <Label>Target pages</Label>
                  <Select value={String(form.pages)} onValueChange={(v) => update("pages", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {pageOptions.map((n) => <SelectItem key={n} value={String(n)}>{n} pages</SelectItem>)}
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

              <Button type="submit" className="w-full bg-gradient-hero text-white border-0 hover:opacity-90 h-12 text-base shadow-playful" disabled={loading}>
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
