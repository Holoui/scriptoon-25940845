import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2, Smartphone, ShieldCheck, CheckCircle2, Copy, Clock } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tier: "pro" | "premium";
  amount: number;
}

type Step = "instructions" | "submitted";

const MERCHANT_NAME = "Saudatu Amadu";
const MERCHANT_NUMBER = "0534361610";

const makeRef = () => {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "SCR-";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

export const MoMoPaymentDialog = ({ open, onOpenChange, tier, amount }: Props) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("instructions");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const reference = useMemo(() => makeRef(), [open]);

  const reset = () => { setStep("instructions"); setPhone(""); setLoading(false); };

  const handleClose = (o: boolean) => {
    if (!loading) { onOpenChange(o); if (!o) setTimeout(reset, 200); }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cleaned = phone.replace(/\D/g, "");
    if (!/^[0-9]{9,15}$/.test(cleaned)) {
      toast({ title: "Invalid MoMo number", description: "Use a valid Ghanaian MoMo number e.g. 0244123456", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("payments").insert({
      user_id: user.id,
      tier,
      amount,
      currency: "GHS",
      provider: "mtn_momo_manual",
      phone_number: cleaned,
      external_reference: reference,
      status: "pending",
    });
    setLoading(false);
    if (error) {
      toast({ title: "Couldn't submit", description: error.message, variant: "destructive" });
      return;
    }
    setStep("submitted");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "instructions" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-sunset text-secondary-foreground shadow-playful">
                  <Smartphone className="h-6 w-6" />
                </span>
                <Badge variant="secondary" className="capitalize">{tier} plan · GHS {amount.toFixed(2)}/mo</Badge>
              </div>
              <DialogTitle className="font-display text-2xl">Pay with MTN MoMo</DialogTitle>
              <DialogDescription>
                Send the amount below to our MoMo number. Then enter your own MoMo number so the admin can verify and unlock your plan.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="rounded-xl border border-border/60 bg-gradient-card p-4 space-y-3">
                <Row label="Send to (MoMo name)" value={MERCHANT_NAME} onCopy={() => copy(MERCHANT_NAME, "Name")} />
                <Row label="MoMo number" value={MERCHANT_NUMBER} onCopy={() => copy(MERCHANT_NUMBER, "Number")} mono />
                <Row label="Amount" value={`GHS ${amount.toFixed(2)}`} onCopy={() => copy(amount.toFixed(2), "Amount")} />
                <Row label="Reference (use in 'Reason')" value={reference} onCopy={() => copy(reference, "Reference")} mono highlight />
              </div>

              <form onSubmit={handleSubmit} className="space-y-3 pt-1">
                <div className="space-y-2">
                  <Label htmlFor="momo-phone">Your MoMo number (the one you paid from)</Label>
                  <Input
                    id="momo-phone"
                    type="tel"
                    placeholder="0244 123 456"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="rounded-xl bg-muted/60 p-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <span>After paying, click <strong>I have paid</strong>. The admin will verify your MoMo transaction and activate your plan — usually within a few minutes.</span>
                </div>

                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={loading}>Cancel</Button>
                  <Button type="submit" disabled={loading} className="bg-gradient-hero text-white border-0 hover:opacity-90">
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</> : <>I have paid</>}
                  </Button>
                </DialogFooter>
              </form>
            </div>
          </>
        )}

        {step === "submitted" && (
          <div className="py-6 text-center space-y-4">
            <div className="grid h-16 w-16 mx-auto place-items-center rounded-3xl bg-success text-success-foreground shadow-playful">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <DialogTitle className="font-display text-2xl mb-1">Payment submitted 🎉</DialogTitle>
              <DialogDescription className="space-y-2">
                <span className="block">We've notified the admin with your reference <strong>{reference}</strong>.</span>
                <span className="inline-flex items-center gap-1 text-xs"><Clock className="h-3 w-3" /> Your <span className="capitalize font-semibold">{tier}</span> plan unlocks once payment is verified.</span>
              </DialogDescription>
            </div>
            <Button onClick={() => handleClose(false)} className="bg-gradient-hero text-white border-0 hover:opacity-90">
              Back to ScriptToon
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ label, value, onCopy, mono, highlight }: { label: string; value: string; onCopy: () => void; mono?: boolean; highlight?: boolean }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`${mono ? "font-mono" : "font-semibold"} ${highlight ? "text-primary text-lg" : ""} truncate`}>{value}</p>
    </div>
    <Button type="button" size="icon" variant="ghost" onClick={onCopy} aria-label={`Copy ${label}`}>
      <Copy className="h-4 w-4" />
    </Button>
  </div>
);
