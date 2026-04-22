import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2, Image as ImageIcon, Lock, Sparkles, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { PLAN_LIMITS, type Tier } from "@/lib/plan-limits";
import { countUsage24h, nextResetAt, USAGE_KINDS } from "@/lib/usage";

const COVER_DAILY: Record<Tier, number> = { free: 0, pro: 3, premium: Infinity };

interface Props {
  scriptId: string;
  initialCoverUrl?: string | null;
  onCoverUpdated?: (url: string) => void;
}

export const CoverGenerator = ({ scriptId, initialCoverUrl, onCoverUpdated }: Props) => {
  const { user, tier } = useAuth();
  const t: Tier = (tier ?? "free") as Tier;
  const limit = COVER_DAILY[t];
  const allowed = t === "pro" || t === "premium";
  const unlimited = !isFinite(limit);

  const [used, setUsed] = useState(0);
  const [retryAt, setRetryAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [style, setStyle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(initialCoverUrl ?? null);

  useEffect(() => { setCoverUrl(initialCoverUrl ?? null); }, [initialCoverUrl]);

  useEffect(() => {
    if (!user || !allowed || unlimited) return;
    (async () => {
      const u = await countUsage24h(user.id, USAGE_KINDS.coverGeneration);
      setUsed(u);
      if (u >= limit) setRetryAt(await nextResetAt(user.id, USAGE_KINDS.coverGeneration));
    })();
  }, [user, allowed, unlimited, limit]);

  useEffect(() => {
    if (!retryAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [retryAt]);

  const cooldownMs = retryAt ? Math.max(0, retryAt.getTime() - now) : 0;
  const remaining = unlimited ? Infinity : Math.max(0, limit - used);
  const blocked = allowed && !unlimited && (remaining <= 0 || cooldownMs > 0);

  const fmtCooldown = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  };

  const handleGenerate = async () => {
    if (!allowed) {
      toast({
        title: "Pro & Premium feature",
        description: "Movie covers are available on Pro and Premium plans.",
        variant: "destructive",
      });
      return;
    }
    if (blocked) {
      toast({
        title: "Daily limit reached",
        description: cooldownMs > 0 ? `Try again in ${fmtCooldown(cooldownMs)}.` : "Upgrade to Premium for unlimited covers.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-cover", {
        body: { script_id: scriptId, style },
      });
      if (error) throw error;
      if (data?.error) {
        if (data.rate_limited && data.retry_at) {
          setRetryAt(new Date(data.retry_at));
          setUsed(data.used ?? used);
        }
        throw new Error(data.error);
      }
      const url: string = data.cover_url;
      // Cache-bust so the new image renders even if URL ever repeats
      const display = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
      setCoverUrl(display);
      onCoverUpdated?.(url);
      if (!unlimited) setUsed((u) => u + 1);
      toast({ title: "Cover generated! 🎬" });
    } catch (err: any) {
      toast({ title: "Couldn't generate cover", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="p-5 bg-gradient-card border-border/60 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="font-display text-lg font-bold flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" /> Movie cover
        </p>
        {allowed ? (
          <Badge variant={blocked ? "destructive" : "secondary"} className="text-xs">
            {unlimited
              ? "Unlimited"
              : cooldownMs > 0
              ? `Retry in ${fmtCooldown(cooldownMs)}`
              : `${remaining}/${limit} left in next 24h`}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs gap-1"><Lock className="h-3 w-3" /> Pro & Premium</Badge>
        )}
      </div>

      {coverUrl ? (
        <div className="relative rounded-xl overflow-hidden border border-border/60 bg-muted/40 aspect-[2/3] max-w-xs mx-auto">
          <img src={coverUrl} alt="Movie cover" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 aspect-[2/3] max-w-xs mx-auto flex items-center justify-center text-muted-foreground text-sm text-center p-4">
          <span>No cover yet. Generate one tailored to your script.</span>
        </div>
      )}

      {!allowed ? (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center text-sm">
          Upgrade to <Link to="/pricing" className="text-primary underline font-semibold">Pro or Premium</Link> to generate AI movie covers for your scripts.
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="Optional art-direction note (e.g. 'noir, neon-drenched, 80s VHS')"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            disabled={generating}
          />
          <Button
            onClick={handleGenerate}
            disabled={generating || blocked}
            className="w-full bg-gradient-hero text-white border-0 hover:opacity-90"
          >
            {generating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Painting your poster…</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> {coverUrl ? "Regenerate cover" : "Generate cover"}</>
            )}
          </Button>
          {coverUrl && (
            <Button asChild variant="outline" size="sm" className="w-full">
              <a href={coverUrl} target="_blank" rel="noreferrer" download>
                <Download className="mr-2 h-4 w-4" /> Download
              </a>
            </Button>
          )}
          {blocked && cooldownMs > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Resets in <span className="font-mono">{fmtCooldown(cooldownMs)}</span>.
              {t === "pro" && <> <Link to="/pricing" className="underline">Upgrade</Link> for unlimited.</>}
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

export default CoverGenerator;