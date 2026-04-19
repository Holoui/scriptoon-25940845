import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2, Download, ArrowLeft, Save, History, Check, AlertTriangle, Wand2, Target } from "lucide-react";
import { exportScreenplayPDF } from "@/lib/screenplay-pdf";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PLAN_LIMITS, countWords, wordsToPages, type Tier } from "@/lib/plan-limits";

interface Script {
  id: string;
  title: string;
  logline: string | null;
  synopsis: string | null;
  content: string;
  genre: string | null;
  status: string;
  user_id: string;
  target_words: number | null;
}

interface Version { id: string; version_number: number; created_at: string; content: string; }

const ScriptEditor = () => {
  const { id } = useParams();
  const { user, tier } = useAuth();
  const limits = PLAN_LIMITS[(tier ?? "free") as Tier];
  const [script, setScript] = useState<Script | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [extending, setExtending] = useState(false);
  const [autoExtend, setAutoExtend] = useState(false);
  const autoCancelRef = useRef(false);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      const { data, error } = await supabase.from("scripts").select("*").eq("id", id).maybeSingle();
      if (error || !data) {
        toast({ title: "Couldn't load script", variant: "destructive" });
        setLoading(false);
        return;
      }
      setScript(data as Script);
      setContent(data.content);
      setTitle(data.title);
      setLogline(data.logline ?? "");
      setSynopsis(data.synopsis ?? "");
      setLoading(false);
    };
    load();
  }, [id]);

  // Auto-save (debounced) on content change
  useEffect(() => {
    if (!script || loading) return;
    if (!dirtyRef.current) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => save(false), 1500);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [content, title, logline, synopsis]);

  const markDirty = () => { dirtyRef.current = true; };

  const save = async (notify = true) => {
    if (!script || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from("scripts")
      .update({ title, logline, synopsis, content })
      .eq("id", script.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    dirtyRef.current = false;
    setSavedAt(new Date());
    if (notify) toast({ title: "Saved" });
  };

  const saveVersion = async () => {
    if (!script || !user) return;
    await save(false);
    const { count } = await supabase
      .from("script_versions")
      .select("*", { count: "exact", head: true })
      .eq("script_id", script.id);
    const next = (count ?? 0) + 1;
    const { error } = await supabase.from("script_versions").insert({
      script_id: script.id, user_id: user.id, content, version_number: next,
    });
    if (error) toast({ title: "Couldn't snapshot version", description: error.message, variant: "destructive" });
    else toast({ title: `Version ${next} saved` });
  };

  const loadVersions = async () => {
    if (!script) return;
    const { data } = await supabase
      .from("script_versions")
      .select("id, version_number, created_at, content")
      .eq("script_id", script.id)
      .order("version_number", { ascending: false });
    setVersions((data as Version[]) ?? []);
  };

  const handleExport = () => {
    if (!script) return;
    exportScreenplayPDF({ title: title || "Untitled", content });
  };

  const extendOnce = async (): Promise<{ done: boolean; added: number; words: number; target: number } | null> => {
    if (!script) return null;
    const target = script.target_words ?? Math.min(6000, limits.words);
    // Persist any pending edits before asking AI to continue
    if (dirtyRef.current) await save(false);
    const { data, error } = await supabase.functions.invoke("extend-script", {
      body: { script_id: script.id, target_words: target },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (data?.content) {
      setContent(data.content);
      dirtyRef.current = false;
      setSavedAt(new Date());
    }
    return { done: !!data?.done, added: data?.added ?? 0, words: data?.words ?? 0, target: data?.target ?? target };
  };

  const handleExtend = async () => {
    if (!script || extending) return;
    setExtending(true);
    autoCancelRef.current = false;
    try {
      if (!autoExtend) {
        const r = await extendOnce();
        if (r) toast({ title: `Added ~${r.added} words`, description: `${r.words} / ${r.target} words` });
        return;
      }
      // Auto-extend: keep calling until target reached, AI stalls, or user cancels
      let lastWords = countWords(content);
      let iterations = 0;
      while (iterations < 10) {
        if (autoCancelRef.current) break;
        const r = await extendOnce();
        if (!r) break;
        if (r.done) {
          toast({ title: "Target reached", description: `${r.words} / ${r.target} words` });
          break;
        }
        if (r.words <= lastWords + 100) {
          toast({ title: "AI couldn't add more", description: `Stopped at ${r.words} / ${r.target} words` });
          break;
        }
        lastWords = r.words;
        iterations++;
      }
    } catch (err: any) {
      toast({ title: "Couldn't extend script", description: err?.message ?? "Extension failed", variant: "destructive" });
    } finally {
      setExtending(false);
      autoCancelRef.current = false;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="container py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </Layout>
    );
  }
  if (!script) {
    return (
      <Layout>
        <div className="container py-20 text-center">
          <p className="text-muted-foreground mb-4">Script not found.</p>
          <Button asChild><Link to="/dashboard">Back to dashboard</Link></Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-6 md:py-8">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Link>
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            {savedAt && (
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" /> Saved {savedAt.toLocaleTimeString()}
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={() => save(true)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Save</>}
            </Button>
            <Sheet onOpenChange={(o) => o && loadVersions()}>
              <SheetTrigger asChild>
                <Button size="sm" variant="outline" onClick={saveVersion}>
                  <History className="mr-2 h-4 w-4" /> Snapshot
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Version history</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-3">
                  {versions.length === 0 && <p className="text-sm text-muted-foreground">No snapshots yet.</p>}
                  {versions.map((v) => (
                    <Card key={v.id} className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">Version {v.version_number}</p>
                        <Button size="sm" variant="ghost" onClick={() => { setContent(v.content); markDirty(); toast({ title: `Restored v${v.version_number}` }); }}>
                          Restore
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</p>
                    </Card>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
            <Button size="sm" onClick={handleExport} className="bg-gradient-hero text-white border-0 hover:opacity-90">
              <Download className="mr-2 h-4 w-4" /> Export PDF
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          <Card className="p-5 bg-gradient-card border-border/60 h-fit lg:sticky lg:top-24">
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Title</label>
                <Input value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }} className="mt-1 font-display text-lg" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Logline</label>
                <Textarea rows={3} value={logline} onChange={(e) => { setLogline(e.target.value); markDirty(); }} className="mt-1" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Synopsis</label>
                <Textarea rows={6} value={synopsis} onChange={(e) => { setSynopsis(e.target.value); markDirty(); }} className="mt-1" />
              </div>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden bg-card border-border/60 shadow-soft">
            {(() => {
              const words = countWords(content);
              const pages = wordsToPages(words);
              const pct = Math.min(100, (pages / limits.pages) * 100);
              const over = pages > limits.pages;
              const near = !over && pct >= 85;
              return (
                <div className="border-b border-border/60 px-5 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="font-display text-lg font-bold">Screenplay</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">{words} words</Badge>
                      <Badge variant={over ? "destructive" : near ? "secondary" : "outline"}>
                        {pages} / {limits.pages} pages
                      </Badge>
                    </div>
                  </div>
                  <Progress value={pct} className={over ? "[&>div]:bg-destructive" : near ? "[&>div]:bg-secondary" : ""} />
                  {over && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      You're over your {limits.label} plan limit. Consider upgrading or trimming.
                    </p>
                  )}
                </div>
              );
            })()}
            <Textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); markDirty(); }}
              className="font-mono-screenplay min-h-[60vh] border-0 rounded-none focus-visible:ring-0 resize-none p-6 text-sm leading-relaxed"
              placeholder="FADE IN:&#10;&#10;INT. COFFEE SHOP - DAY&#10;&#10;Maya enters, scanning the room…"
            />
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default ScriptEditor;
