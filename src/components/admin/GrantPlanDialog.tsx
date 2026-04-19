import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Crown, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Tier = "pro" | "premium";

interface Props {
  userId: string;
  userLabel: string;
  currentTier: string;
  currentPeriodEnd: string | null;
  onGranted?: () => void;
}

export const GrantPlanDialog = ({ userId, userLabel, currentTier, currentPeriodEnd, onGranted }: Props) => {
  const { user: adminUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<Tier>("pro");
  const [months, setMonths] = useState("1");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [todayCount, setTodayCount] = useState<number | null>(null);

  const reset = () => { setTier("pro"); setMonths("1"); setReason(""); };

  const loadTodayCount = async () => {
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("script_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", start.toISOString());
    setTodayCount(count ?? 0);
  };

  const resetDailyCount = async () => {
    if (!confirm(`Reset today's generation count for ${userLabel}?`)) return;
    setResetting(true);
    try {
      const start = new Date(); start.setUTCHours(0, 0, 0, 0);
      const { error } = await supabase
        .from("script_generations")
        .delete()
        .eq("user_id", userId)
        .gte("created_at", start.toISOString());
      if (error) throw error;

      await supabase.from("notifications").insert({
        user_id: userId,
        kind: "generations_reset",
        title: "Daily generation limit reset",
        body: "An admin reset your daily script generation count. You can generate again today.",
      });

      toast({ title: "Daily count reset", description: `${userLabel} can generate again today.` });
      setTodayCount(0);
      onGranted?.();
    } catch (e: any) {
      toast({ title: "Couldn't reset", description: e.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const submit = async () => {
    if (!adminUser || !reason.trim()) {
      toast({ title: "Reason required", description: "Add a short note for the audit log.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const m = parseInt(months, 10);
      // Extend from later of (now, current end)
      const base = currentPeriodEnd && new Date(currentPeriodEnd) > new Date()
        ? new Date(currentPeriodEnd)
        : new Date();
      const newEnd = new Date(base);
      newEnd.setMonth(newEnd.getMonth() + m);

      // Upsert subscription
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      const subPayload = { user_id: userId, tier, current_period_end: newEnd.toISOString() };
      const { error: subErr } = existing
        ? await supabase.from("subscriptions").update(subPayload).eq("user_id", userId)
        : await supabase.from("subscriptions").insert(subPayload);
      if (subErr) throw subErr;

      // Audit
      const { error: grantErr } = await supabase.from("plan_grants").insert({
        user_id: userId,
        tier,
        duration_months: m,
        reason: reason.trim(),
        granted_by: adminUser.id,
        previous_tier: (currentTier as any) ?? "free",
        previous_period_end: currentPeriodEnd,
        new_period_end: newEnd.toISOString(),
      });
      if (grantErr) throw grantErr;

      // In-app notification for the user
      await supabase.from("notifications").insert({
        user_id: userId,
        kind: "plan_granted",
        title: `You've been upgraded to ${tier.charAt(0).toUpperCase() + tier.slice(1)}`,
        body: `An admin granted you ${m} month${m === 1 ? "" : "s"} of ${tier}. Enjoy!`,
      });

      toast({ title: "Plan granted", description: `${userLabel} → ${tier} for ${m} month${m === 1 ? "" : "s"}` });
      setOpen(false);
      reset();
      onGranted?.();
    } catch (e: any) {
      toast({ title: "Couldn't grant plan", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) loadTodayCount(); else reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Crown className="h-3 w-3" /> Grant
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant plan to {userLabel}</DialogTitle>
          <DialogDescription>
            Manually upgrade or extend without payment. Current: <span className="font-semibold capitalize">{currentTier}</span>
            {currentPeriodEnd && <> · ends {new Date(currentPeriodEnd).toLocaleDateString()}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Duration</Label>
              <Select value={months} onValueChange={setMonths}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 month</SelectItem>
                  <SelectItem value="3">3 months</SelectItem>
                  <SelectItem value="6">6 months</SelectItem>
                  <SelectItem value="12">12 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Reason (audit note) *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Comp for refund · Paid in cash · Beta tester reward"
              rows={3}
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Daily generations</p>
              <p className="text-xs text-muted-foreground">
                Used today: <span className="font-mono text-foreground">{todayCount ?? "…"}</span>
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={resetDailyCount}
              disabled={resetting || todayCount === 0}
              className="gap-1 shrink-0"
            >
              {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              Reset count
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !reason.trim()} className="bg-gradient-hero text-white border-0">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Grant plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
