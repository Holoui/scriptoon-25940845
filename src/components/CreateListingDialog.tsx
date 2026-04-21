import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scriptId: string;
  defaultTitle: string;
  defaultGenre?: string | null;
  defaultPreview?: string;
}

export function CreateListingDialog({ open, onOpenChange, scriptId, defaultTitle, defaultGenre, defaultPreview }: Props) {
  const { user, tier } = useAuth();
  const navigate = useNavigate();
  const canSell = tier === "pro" || tier === "premium";

  const [title, setTitle] = useState(defaultTitle);
  const [pitch, setPitch] = useState("");
  const [price, setPrice] = useState("100");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) return;
    if (!title.trim() || !pitch.trim() || !price) {
      toast({ title: "Title, pitch and price are required", variant: "destructive" });
      return;
    }
    const priceNum = Number(price);
    if (!isFinite(priceNum) || priceNum < 0) {
      toast({ title: "Enter a valid price", variant: "destructive" });
      return;
    }
    setBusy(true);
    const preview = (defaultPreview ?? "").slice(0, 1500);
    const { data, error } = await supabase.from("script_listings").insert({
      user_id: user.id,
      script_id: scriptId,
      title: title.trim(),
      pitch: pitch.trim(),
      preview,
      genre: defaultGenre ?? null,
      price_ghs: priceNum,
      contact_phone: phone.trim() || null,
      contact_email: email.trim() || null,
    }).select("id").single();
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't list script", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Listed on the marketplace! 🎉" });
    onOpenChange(false);
    navigate(`/marketplace/${data.id}`);
  };

  if (!canSell) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selling is a Pro feature</DialogTitle>
            <DialogDescription>Upgrade to Pro or Premium to list your scripts on the marketplace.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => navigate("/pricing")} className="bg-gradient-hero text-white border-0">See plans</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4" /> List script for sale</DialogTitle>
          <DialogDescription>Buyers contact you off-platform. You can mark sold or remove anytime.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Pitch (sell this script — what makes it special?)</Label>
            <Textarea value={pitch} onChange={(e) => setPitch(e.target.value)} rows={4} placeholder="A sci-fi thriller where memory is currency…" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Price (GHS)</Label>
            <Input type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Contact phone (optional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Contact email (optional)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">A short preview from your script (first ~1,500 chars) will be shown publicly.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-gradient-hero text-white border-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "List script"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}