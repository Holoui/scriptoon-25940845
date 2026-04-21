import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FileText, FileType, Crown, Lock, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PLAN_LIMITS, type Tier } from "@/lib/plan-limits";
import { countUsage24h, logUsage, USAGE_KINDS } from "@/lib/usage";
import { exportScreenplayPDF } from "@/lib/screenplay-pdf";
import { exportScreenplayDOCX } from "@/lib/screenplay-docx";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  content: string;
}

export function ExportDialog({ open, onOpenChange, title, content }: Props) {
  const { user, tier } = useAuth();
  const t: Tier = (tier ?? "free") as Tier;
  const limits = PLAN_LIMITS[t];

  const [removeWatermark, setRemoveWatermark] = useState(t === "premium");
  const [removalsUsed, setRemovalsUsed] = useState(0);
  const [busy, setBusy] = useState<null | "pdf" | "docx">(null);

  const canRemove = limits.watermark === "never" || limits.watermark === "removable";
  const isPremium = limits.watermark === "never";
  const removalsLimit = limits.dailyWatermarkRemovals;
  const removalsLeft = isFinite(removalsLimit) ? Math.max(0, removalsLimit - removalsUsed) : Infinity;

  useEffect(() => {
    if (!open || !user || isPremium) return;
    countUsage24h(user.id, USAGE_KINDS.watermarkRemoved).then(setRemovalsUsed);
    setRemoveWatermark(false);
  }, [open, user, isPremium]);

  // Premium: always watermark-free. Free: always watermarked.
  const willWatermark = isPremium ? false : t === "free" ? true : !removeWatermark;

  const exportFile = async (format: "pdf" | "docx") => {
    if (!user) return;
    // Pro removing the watermark — verify quota and log usage BEFORE export
    if (removeWatermark && t === "pro") {
      const used = await countUsage24h(user.id, USAGE_KINDS.watermarkRemoved);
      if (used >= removalsLimit) {
        toast({
          title: "Watermark removal limit reached",
          description: `You've used your ${removalsLimit} watermark-free exports for the day. Try again in 24h or upgrade to Premium for unlimited.`,
          variant: "destructive",
        });
        setRemovalsUsed(used);
        return;
      }
      await logUsage(user.id, USAGE_KINDS.watermarkRemoved);
      setRemovalsUsed(used + 1);
    }

    setBusy(format);
    try {
      if (format === "pdf") {
        exportScreenplayPDF({ title, content, watermark: willWatermark });
      } else {
        await exportScreenplayDOCX({ title, content, watermark: willWatermark });
      }
      toast({ title: `Exported as ${format.toUpperCase()}` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Export failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export screenplay</DialogTitle>
          <DialogDescription>Download "{title || "Untitled"}" as a PDF or Word document.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Watermark control */}
          {isPremium ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
              <Crown className="h-5 w-5 text-primary shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Watermark-free forever</p>
                <p className="text-muted-foreground text-xs">Premium exports never carry the ScriptToon watermark.</p>
              </div>
            </div>
          ) : t === "pro" ? (
            <div className="rounded-lg border border-border/60 bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium">Remove ScriptToon watermark</p>
                  <p className="text-muted-foreground text-xs">
                    {removalsLeft} of {removalsLimit} watermark-free exports left today
                  </p>
                </div>
                <Switch
                  checked={removeWatermark}
                  onCheckedChange={setRemoveWatermark}
                  disabled={removalsLeft <= 0}
                />
              </div>
              {removalsLeft <= 0 && (
                <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Daily limit reached. <Link to="/pricing" className="underline ml-1">Upgrade to Premium</Link> for unlimited.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 flex items-start gap-3">
              <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Free exports include a watermark</p>
                <p className="text-muted-foreground text-xs">
                  <Link to="/pricing" className="underline">Upgrade to Pro</Link> for 2 watermark-free exports/day, or Premium for unlimited.
                </p>
              </div>
            </div>
          )}

          {willWatermark && (
            <Badge variant="secondary" className="text-xs">This export will include the SCRIPTOON watermark</Badge>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => exportFile("pdf")}
            disabled={busy !== null}
          >
            {busy === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Download PDF
          </Button>
          <Button
            className="flex-1 bg-gradient-hero text-white border-0 hover:opacity-90"
            onClick={() => exportFile("docx")}
            disabled={busy !== null}
          >
            {busy === "docx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileType className="mr-2 h-4 w-4" />}
            Download DOCX
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}