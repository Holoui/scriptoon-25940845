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
import { Loader2, Download, ArrowLeft, Save, History, Check, AlertTriangle, Wand2, Target, Lock, Share2 } from "lucide-react";
import { ExportDialog } from "@/components/ExportDialog";
import { CreateListingDialog } from "@/components/CreateListingDialog";
import { CoverGenerator } from "@/components/CoverGenerator";
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
  cover_url: string | null;
}

interface Version { id: string; version_number: number; created_at: string; content: string; }

const ScriptEditor = () => {
  const { id } = useParams();
  const { user, tier } = useAuth();
  const t: Tier = (tier ?? "free") as Tier;
  const limits = PLAN_LIMITS[t];
  const canExtend = limits.allowExtend;
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
  const [planCapped, setPlanCapped] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [listingOpen, setListingOpen] = useState(false);
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
    setExportOpen(true);
  };

  const extendOnce = async (): Promise<{ done: boolean; added: number; words: number; target: number; capped?: boolean; message?: string } | null> => {
    if (!script) return null;
    const target = script.target_words ?? Math.min(6000, limits.words);
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
    if (data?.plan_capped) setPlanCapped(true);
    return {
      done: !!data?.done,
      added: data?.added ?? 0,
      words: data?.words ?? 0,
      target: data?.target ?? target,
      capped: !!data?.capped,
      message: data?.message,
    };
  };

  const handleExtend = async () => {
    if (!script || extending) return;
    if (!canExtend) {
      toast({ title: "Extend not available on your plan", variant: "destructive" });
      return;
    }
    setExtending(true);
    autoCancelRef.current = false;
    try {
      if (!autoExtend) {
        const r = await extendOnce();
        if (r?.capped) toast({ title: "Plan limit reached", description: r.message ?? "You've hit your plan ceiling.", variant: "destructive" });
        else if (r) toast({ title: `Added ~${r.added} words`, description: `${r.words} / ${r.target} words` });
        return;
      }
      let lastWords = countWords(content);
      let iterations = 0;
      while (iterations < 10) {
        if (autoCancelRef.current) break;
        const r = await extendOnce();
        if (!r) break;
        if (r.capped) {
          toast({ title: "Plan limit reached", description: r.message ?? "You've hit your plan ceiling.", variant: "destructive" });
          break;
        }
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
      const msg = err?.message ?? "Extension failed";
      if (msg.toLowerCase().includes("pro and premium") || msg.toLowerCase().includes("upgrade")) {
        toast({ title: "Upgrade required", description: msg, variant: "destructive" });
      } else {
        toast({ title: "Couldn't extend script", description: msg, variant: "destructive" });
      }
    } finally {
      setExtending(false);
      autoCancelRef.current = false;
    }
  };

  const publishToCommunity = async () => {
    if (!script || !user) return;
    if (!content.trim()) {
      toast({ title: "Nothing to publish yet", variant: "destructive" });
      return;
    }
    setPublishing(true);
    try {
      const authorName = user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "Anonymous";
      const excerpt = (synopsis || content).slice(0, 280);
      const { error } = await supabase.from("community_posts").insert({
        user_id: user.id,
        script_id: script.id,
        title: title || "Untitled",
        excerpt,
        body: content,
        genre: script.genre,
        author_name: authorName,
      });
      if (error) throw error;
      toast({ title: "Published to community! 🎉", description: "Readers can now like and comment on your script." });
    } catch (err: any) {
      toast({ title: "Couldn't publish", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setPublishing(false);
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
            <Button size="sm" variant="outline" onClick={publishToCommunity} disabled={publishing}>
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Share2 className="mr-2 h-4 w-4" /> Publish</>}
            </Button>
            {(t === "pro" || t === "premium") && (
              <Button size="sm" variant="outline" onClick={() => setListingOpen(true)}>
                <Target className="mr-2 h-4 w-4" /> Sell
              </Button>
            )}
            <Button size="sm" onClick={handleExport} className="bg-gradient-hero text-white border-0 hover:opacity-90">
              <Download className="mr-2 h-4 w-4" /> Export
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
          <div className="lg:hidden" />

          <Card className="p-0 overflow-hidden bg-card border-border/60 shadow-soft">
            {(() => {
              const words = countWords(content);
              const pages = wordsToPages(words);
              const target = script.target_words ?? Math.min(6000, limits.words);
              const targetPct = Math.min(100, (words / target) * 100);
              const planPct = Math.min(100, (pages / limits.pages) * 100);
              const overPlan = pages > limits.pages;
              const nearPlan = !overPlan && planPct >= 85;
              const reachedTarget = words >= target - 50;
              const shortfall = Math.max(0, target - words);
              return (
                <div className="border-b border-border/60 px-5 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="font-display text-lg font-bold">Screenplay</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono gap-1">
                        <Target className="h-3 w-3" /> {words.toLocaleString()} / {target.toLocaleString()} words
                      </Badge>
                      <Badge variant={overPlan ? "destructive" : nearPlan ? "secondary" : "outline"}>
                        {pages} / {limits.pages} pages
                      </Badge>
                    </div>
                  </div>
                  <Progress
                    value={targetPct}
                    className={reachedTarget ? "[&>div]:bg-primary" : ""}
                  />
                  <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                    <p className="text-muted-foreground">
                      {planCapped
                        ? `🛑 You've hit your ${limits.label} plan ceiling (~${limits.words.toLocaleString()} words / ${limits.pages} pages).`
                        : reachedTarget
                        ? "🎯 Target reached — you can keep extending or polish what's there."
                        : `${shortfall.toLocaleString()} words to go to hit your target.`}
                    </p>
                    <div className="flex items-center gap-2">
                      {canExtend && (
                        <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={autoExtend}
                            onChange={(e) => setAutoExtend(e.target.checked)}
                            disabled={extending}
                          />
                          Auto until target
                        </label>
                      )}
                      <Button
                        size="sm"
                        onClick={handleExtend}
                        disabled={extending || overPlan || planCapped}
                        className="bg-gradient-hero text-white border-0 hover:opacity-90"
                      >
                        {extending ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Extending…</>
                        ) : (
                          <><Wand2 className="mr-2 h-4 w-4" /> {reachedTarget ? "Extend more" : "Extend script"}</>
                        )}
                      </Button>
                    </div>
                  </div>
                  {t === "free" && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Free plan: 1 Extend every 24h. <Link to="/pricing" className="underline ml-1">Upgrade</Link> for unlimited.
                    </p>
                  )}
                  {planCapped && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Plan ceiling reached. {t === "premium" ? "Start a new script to keep writing." : <>Upgrade your plan to extend further. <Link to="/pricing" className="underline ml-1">See plans</Link></>}
                    </p>
                  )}
                  {overPlan && !planCapped && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      You're over your {limits.label} plan limit. Upgrade to extend further.
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
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title={title || "Untitled"}
        content={content}
      />
      <CreateListingDialog
        open={listingOpen}
        onOpenChange={setListingOpen}
        scriptId={script.id}
        defaultTitle={title || "Untitled"}
        defaultGenre={script.genre}
        defaultPreview={content}
      />
    </Layout>
  );
};

export default ScriptEditor;
