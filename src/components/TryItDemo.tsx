import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Download, Lock, Wand2, FileText } from "lucide-react";
import { exportScreenplayPDF } from "@/lib/screenplay-pdf";

const GENRES = [
  "Drama", "Thriller", "Comedy", "Romance", "Sci-Fi", "Horror", "Action", "Mystery", "Fantasy", "LGBTQ+",
];
const TONES = ["Cinematic", "Gritty", "Heartfelt", "Dark", "Whimsical", "Suspenseful"];

type Result = { title: string; logline: string; screenplay: string };

export const TryItDemo = () => {
  const { user } = useAuth();
  const [plot, setPlot] = useState("");
  const [genre, setGenre] = useState("Drama");
  const [tone, setTone] = useState("Cinematic");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const generate = async () => {
    const trimmed = plot.trim();
    if (trimmed.length < 10) {
      toast({ title: "Add a little more", description: "Describe your idea in at least a sentence.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("try-script", {
        body: { plot_idea: trimmed, genre, tone },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as Result);
    } catch (err: any) {
      toast({ title: "Couldn't generate teaser", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    if (!user) {
      // Persist the teaser so the user can download it after logging in
      try {
        sessionStorage.setItem("pending_demo_pdf", JSON.stringify(result));
      } catch {}
      toast({
        title: "Sign in to download",
        description: "Your teaser is saved — log in (it's free) and we'll download it for you.",
      });
      return;
    }
    exportScreenplayPDF({ title: result.title, content: result.screenplay, watermark: true });
    toast({ title: "Downloaded", description: "Free-plan teaser PDF saved to your device." });
  };

  return (
    <section className="container py-12 md:py-20">
      <div className="text-center mb-10">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/30 border border-secondary/40 text-sm font-medium mb-4">
          <Sparkles className="h-4 w-4 text-primary" /> Try it free — no signup
        </span>
        <h2 className="font-display text-4xl md:text-5xl font-bold mb-3">
          Generate a <span className="bg-gradient-hero bg-clip-text text-transparent">teaser screenplay</span> right now
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Drop in a story idea and we'll spin up a short, formatted opening. Like it? Sign in (free) to download the PDF.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Input */}
        <Card className="p-6 md:p-8 bg-gradient-card border-border/60 shadow-soft">
          <div className="flex items-center gap-2 mb-5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-hero text-white shadow-playful">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-xl font-bold leading-tight">Story setup</h3>
              <p className="text-xs text-muted-foreground">Free demo · ~2-3 page teaser</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div className="space-y-1.5">
              <Label htmlFor="demo-genre" className="text-xs">Genre</Label>
              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger id="demo-genre"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-tone" className="text-xs">Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger id="demo-tone"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 mb-4">
            <Label htmlFor="demo-plot" className="text-xs">Story idea</Label>
            <Textarea
              id="demo-plot"
              value={plot}
              onChange={(e) => setPlot(e.target.value.slice(0, 600))}
              placeholder="A retired detective in Accra is pulled into one last case when his estranged daughter goes missing..."
              rows={5}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground text-right">{plot.length}/600</p>
          </div>

          <Button
            onClick={generate}
            disabled={loading}
            size="lg"
            className="w-full bg-gradient-hero text-white border-0 hover:opacity-90 h-12"
          >
            {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Writing your teaser…</> : <><Sparkles className="mr-2 h-5 w-5" /> Generate teaser</>}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-3 text-center">
            Free demo runs on the free plan. Upgrade later for full-length screenplays, extends, and clean exports.
          </p>
        </Card>

        {/* Output */}
        <Card className="p-6 md:p-8 bg-card/70 border-border/60 shadow-soft min-h-[420px] flex flex-col">
          {!result && !loading && (
            <div className="flex-1 grid place-items-center text-center">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary/40 mb-4">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-display text-lg font-semibold mb-1">Your teaser will appear here</p>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Fill in a story idea on the left, then hit <span className="font-medium">Generate teaser</span>.
                </p>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex-1 grid place-items-center text-center">
              <div className="space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Storyboarding your opening scenes…</p>
              </div>
            </div>
          )}

          {result && (
            <div className="flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-display text-2xl font-bold leading-tight">{result.title}</h3>
                  {result.logline && <p className="text-sm text-muted-foreground mt-1 italic">{result.logline}</p>}
                </div>
                <Badge variant="secondary" className="shrink-0">Free teaser</Badge>
              </div>
              <div className="flex-1 overflow-auto rounded-xl border border-border/60 bg-background/60 p-4 mb-4 max-h-[360px]">
                <pre className="font-mono text-xs leading-5 whitespace-pre-wrap text-foreground">{result.screenplay}</pre>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={handleDownload} className="flex-1 h-11">
                  {user ? <><Download className="mr-2 h-4 w-4" /> Download PDF</> : <><Lock className="mr-2 h-4 w-4" /> Sign in to download</>}
                </Button>
                {!user && (
                  <Button asChild variant="outline" className="flex-1 h-11">
                    <Link to="/auth">Create free account</Link>
                  </Button>
                )}
              </div>
              {!user && (
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  We'll keep your teaser ready — sign in (free) and the download starts automatically.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </section>
  );
};