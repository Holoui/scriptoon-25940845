import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Wand2 } from "lucide-react";

const GENRES = ["Romance", "Thriller", "Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Fantasy", "Mystery", "Adventure"];
const TONES = ["Light & playful", "Dark & gritty", "Heartwarming", "Suspenseful", "Quirky & offbeat", "Epic & cinematic", "Satirical"];

const NewScript = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    genre: "",
    tone: "",
    characters: "",
    plot_idea: "",
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.plot_idea.trim()) {
      toast({ title: "Plot idea required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-script", { body: form });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Script ready!", description: data.title });
      navigate(`/dashboard/scripts/${data.id}`);
    } catch (err: any) {
      const msg = err?.message ?? "Generation failed";
      toast({ title: "Couldn't generate script", description: msg, variant: "destructive" });
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
                      {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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
