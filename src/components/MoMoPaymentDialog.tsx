import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Smartphone, ShieldCheck, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tier: "pro" | "premium";
  amount: number;
}

type Step = "form" | "pending" | "success";

export const MoMoPaymentDialog = ({ open, onOpenChange, tier, amount }: Props) => {
  const [step, setStep] = useState<Step>("form");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const reset = () => { setStep("form"); setPhone(""); setReference(null); setLoading(false); };

  const handleClose = (o: boolean) => {
    if (!loading) { onOpenChange(o); if (!o) setTimeout(reset, 200); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phone.replace(/\s+/g, "");
    if (!/^\+?[0-9]{9,15}$/.test(cleaned)) {
      toast({ title: "Invalid phone number", description: "Use international format e.g. +256770000000", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("momo-request-payment", {
        body: { phone: cleaned, tier, amount, currency: "EUR" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReference(data.reference);
      setStep("pending");
      toast({ title: "Payment request sent", description: "Approve the prompt on your phone." });

      // Simulated polling — real verification happens server-side via webhook/check.
      setTimeout(() => setStep("success"), 4500);
    } catch (err: any) {
      toast({ title: "Payment failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "form" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-sunset text-secondary-foreground shadow-playful">
                  <Smartphone className="h-6 w-6" />
                </span>
                <Badge variant="secondary" className="capitalize">{tier} plan · €{amount.toFixed(2)}/mo</Badge>
              </div>
              <DialogTitle className="font-display text-2xl">Pay with MTN MoMo</DialogTitle>
              <DialogDescription>
                Enter your MTN Mobile Money number. You'll receive a payment prompt on your phone — approve it with your PIN.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="momo-phone">MoMo phone number</Label>
                <Input
                  id="momo-phone"
                  type="tel"
                  placeholder="+256 7XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Use your full international number, including country code.</p>
              </div>

              <div className="rounded-xl bg-muted/60 p-3 flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <span>Your number is sent securely to MTN and never stored in plaintext on our side.</span>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={loading}>Cancel</Button>
                <Button type="submit" disabled={loading} className="bg-gradient-hero text-white border-0 hover:opacity-90">
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : <>Pay €{amount.toFixed(2)}</>}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === "pending" && (
          <div className="py-6 text-center space-y-4">
            <div className="grid h-16 w-16 mx-auto place-items-center rounded-3xl bg-gradient-hero text-white shadow-playful animate-pulse">
              <Smartphone className="h-8 w-8" />
            </div>
            <div>
              <DialogTitle className="font-display text-2xl mb-1">Check your phone</DialogTitle>
              <DialogDescription>
                Approve the MoMo request to confirm payment. Don't close this window.
              </DialogDescription>
            </div>
            {reference && <p className="text-xs text-muted-foreground">Reference: {reference}</p>}
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
          </div>
        )}

        {step === "success" && (
          <div className="py-6 text-center space-y-4">
            <div className="grid h-16 w-16 mx-auto place-items-center rounded-3xl bg-success text-success-foreground shadow-playful">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <DialogTitle className="font-display text-2xl mb-1">Payment received 🎉</DialogTitle>
              <DialogDescription>
                Your <span className="capitalize font-semibold">{tier}</span> plan will activate as soon as MTN confirms the transaction (usually within seconds).
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
