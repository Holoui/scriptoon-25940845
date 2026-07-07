import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2, DollarSign, Users, Sparkles, Copy, Wallet, TrendingUp } from "lucide-react";

const MIN_WITHDRAW = 50;

type Affiliate = { user_id: string; referral_code: string };
type Earning = { id: string; amount: number; currency: string; status: string; created_at: string; referred_user_id: string };
type Withdrawal = { id: string; amount: number; currency: string; provider: string; phone_number: string; account_name: string; status: string; admin_note: string | null; created_at: string; processed_at: string | null };

const Affiliate = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [referralNames, setReferralNames] = useState<Record<string, string>>({});
  const [referralCount, setReferralCount] = useState(0);
  const [joining, setJoining] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [wAmount, setWAmount] = useState<string>("");
  const [wProvider, setWProvider] = useState<"mtn" | "telecel" | "airtel">("mtn");
  const [wPhone, setWPhone] = useState("");
  const [wName, setWName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data: aff } = await supabase.from("affiliates").select("user_id, referral_code").eq("user_id", user.id).maybeSingle();
    setAffiliate(aff);
    if (aff) {
      const [{ data: e }, { data: w }, { count }, { data: refs }] = await Promise.all([
        supabase.from("affiliate_earnings").select("*").eq("affiliate_user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("withdrawal_requests").select("*").eq("affiliate_user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("referrals").select("id", { count: "exact", head: true }).eq("affiliate_user_id", user.id),
        supabase.from("referrals").select("referred_user_id").eq("affiliate_user_id", user.id),
      ]);
      setEarnings((e ?? []) as any);
      setWithdrawals((w ?? []) as any);
      setReferralCount(count ?? 0);
      const ids = (refs ?? []).map((r: any) => r.referred_user_id);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name, email").in("id", ids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { map[p.id] = p.display_name || p.email || p.id.slice(0, 8); });
        setReferralNames(map);
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const totalEarned = earnings.reduce((s, r) => s + Number(r.amount), 0);
  const pendingOrPaidOut = withdrawals
    .filter((w) => w.status !== "rejected")
    .reduce((s, r) => s + Number(r.amount), 0);
  const totalPaid = withdrawals.filter((w) => w.status === "paid").reduce((s, r) => s + Number(r.amount), 0);
  const available = Math.max(0, totalEarned - pendingOrPaidOut);

  const referralUrl = affiliate
    ? `${window.location.origin}/?ref=${affiliate.referral_code}`
    : "";

  const join = async () => {
    if (!user) return;
    setJoining(true);
    const code = (user.id.replace(/-/g, "").slice(0, 6) + Math.random().toString(36).slice(2, 6)).toUpperCase();
    const { error } = await supabase.from("affiliates").insert({ user_id: user.id, referral_code: code });
    setJoining(false);
    if (error) {
      toast({ title: "Couldn't join", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Welcome to the affiliate program! 🎉" });
    load();
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(referralUrl);
    toast({ title: "Link copied" });
  };

  const submitWithdraw = async () => {
    if (!user) return;
    const amt = Number(wAmount);
    if (!amt || amt < MIN_WITHDRAW) {
      toast({ title: `Minimum withdrawal is GHS ${MIN_WITHDRAW}`, variant: "destructive" });
      return;
    }
    if (amt > available) {
      toast({ title: "Amount exceeds available balance", variant: "destructive" });
      return;
    }
    if (!/^\d{9,15}$/.test(wPhone.replace(/\s|\+/g, ""))) {
      toast({ title: "Enter a valid mobile money number", variant: "destructive" });
      return;
    }
    if (!wName.trim()) {
      toast({ title: "Enter the account name", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("withdrawal_requests").insert({
      affiliate_user_id: user.id,
      amount: amt,
      provider: wProvider,
      phone_number: wPhone.trim(),
      account_name: wName.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Couldn't submit", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Withdrawal requested", description: "The admin will process your payout shortly." });
    setWithdrawOpen(false);
    setWAmount(""); setWPhone(""); setWName("");
    load();
  };

  if (loading) {
    return <Layout><div className="container py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="container py-8 md:py-12 max-w-5xl">
        <div className="mb-8">
          <Badge className="mb-2 bg-gradient-hero text-white border-0"><Sparkles className="h-3 w-3 mr-1" /> Affiliate Program</Badge>
          <h1 className="font-display text-4xl md:text-5xl font-black">Earn 3% for every referral</h1>
          <p className="text-muted-foreground mt-2">Share your link. Get paid via MTN, Telecel, or Airtel mobile money when your referrals upgrade.</p>
        </div>

        {!affiliate ? (
          <Card className="p-8 md:p-12 bg-gradient-card border-border/60 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-hero text-white">
              <TrendingUp className="h-8 w-8" />
            </div>
            <h2 className="font-display text-2xl font-bold mb-2">Join the program</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Get a unique referral link. When someone signs up through it and buys a paid plan, you earn <strong>3%</strong> of the sale. Withdraw from <strong>GHS {MIN_WITHDRAW}</strong>.
            </p>
            <Button onClick={join} disabled={joining} size="lg" className="bg-gradient-hero text-white border-0 hover:opacity-90">
              {joining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Join now
            </Button>
          </Card>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Stat icon={Users} label="Referrals" value={referralCount.toString()} />
              <Stat icon={DollarSign} label="Total earned" value={`GHS ${totalEarned.toFixed(2)}`} />
              <Stat icon={Wallet} label="Available" value={`GHS ${available.toFixed(2)}`} accent />
              <Stat icon={TrendingUp} label="Paid out" value={`GHS ${totalPaid.toFixed(2)}`} />
            </div>

            <Card className="p-6 mb-6 bg-gradient-card border-border/60">
              <Label className="text-xs uppercase text-muted-foreground">Your referral link</Label>
              <div className="flex gap-2 mt-2">
                <Input readOnly value={referralUrl} className="font-mono text-sm" />
                <Button variant="outline" onClick={copyLink}><Copy className="h-4 w-4 mr-1" /> Copy</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Code: <span className="font-mono font-semibold">{affiliate.referral_code}</span></p>
            </Card>

            <div className="flex justify-end mb-4">
              <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="bg-gradient-hero text-white border-0 hover:opacity-90" disabled={available < MIN_WITHDRAW}>
                    <Wallet className="mr-2 h-4 w-4" /> Withdraw
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Request a withdrawal</DialogTitle>
                    <DialogDescription>
                      Minimum GHS {MIN_WITHDRAW}. Available balance: <strong>GHS {available.toFixed(2)}</strong>.
                      The admin will send the money to your mobile money account after approval.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Amount (GHS)</Label>
                      <Input type="number" min={MIN_WITHDRAW} step="0.01" value={wAmount} onChange={(e) => setWAmount(e.target.value)} placeholder={`${MIN_WITHDRAW}`} />
                    </div>
                    <div className="space-y-2">
                      <Label>Mobile money provider</Label>
                      <Select value={wProvider} onValueChange={(v: any) => setWProvider(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mtn">MTN Mobile Money</SelectItem>
                          <SelectItem value="telecel">Telecel Cash</SelectItem>
                          <SelectItem value="airtel">AirtelTigo Money</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Mobile money number</Label>
                      <Input value={wPhone} onChange={(e) => setWPhone(e.target.value)} placeholder="0244123456" />
                    </div>
                    <div className="space-y-2">
                      <Label>Account name (as registered on MoMo)</Label>
                      <Input value={wName} onChange={(e) => setWName(e.target.value)} placeholder="Ada Lovelace" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
                    <Button onClick={submitWithdraw} disabled={submitting} className="bg-gradient-hero text-white border-0">
                      {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Submit request
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Tabs defaultValue="earnings">
              <TabsList>
                <TabsTrigger value="earnings">Earnings</TabsTrigger>
                <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
                <TabsTrigger value="referrals">Referrals</TabsTrigger>
              </TabsList>

              <TabsContent value="earnings">
                <Card className="p-0 overflow-hidden">
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Referred user</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {earnings.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No earnings yet. Share your link!</TableCell></TableRow>}
                      {earnings.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs">{new Date(e.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>{referralNames[e.referred_user_id] ?? e.referred_user_id.slice(0, 8)}</TableCell>
                          <TableCell className="font-semibold">{e.currency} {Number(e.amount).toFixed(2)}</TableCell>
                          <TableCell><Badge variant="secondary" className="capitalize">{e.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </TabsContent>

              <TabsContent value="withdrawals">
                <Card className="p-0 overflow-hidden">
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Provider</TableHead><TableHead>Number</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {withdrawals.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No withdrawals yet</TableCell></TableRow>}
                      {withdrawals.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell className="text-xs">{new Date(w.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="font-semibold">{w.currency} {Number(w.amount).toFixed(2)}</TableCell>
                          <TableCell className="uppercase text-xs">{w.provider}</TableCell>
                          <TableCell className="font-mono text-xs">{w.phone_number}</TableCell>
                          <TableCell>
                            <Badge variant={w.status === "paid" ? "default" : w.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{w.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs">{w.admin_note ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </TabsContent>

              <TabsContent value="referrals">
                <Card className="p-0 overflow-hidden">
                  <Table>
                    <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Earnings from them</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {Object.keys(referralNames).length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">No referrals yet</TableCell></TableRow>}
                      {Object.entries(referralNames).map(([id, name]) => {
                        const sum = earnings.filter((e) => e.referred_user_id === id).reduce((s, r) => s + Number(r.amount), 0);
                        return (
                          <TableRow key={id}>
                            <TableCell>{name}</TableCell>
                            <TableCell className="font-semibold">GHS {sum.toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </Layout>
  );
};

const Stat = ({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: boolean }) => (
  <Card className={`p-5 border-border/60 ${accent ? "bg-gradient-hero text-white" : "bg-gradient-card"}`}>
    <div className="flex items-center justify-between mb-2">
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${accent ? "bg-white/20" : "bg-gradient-hero text-white"}`}>
        <Icon className="h-5 w-5" />
      </span>
    </div>
    <p className="text-2xl font-display font-black">{value}</p>
    <p className={`text-sm ${accent ? "text-white/80" : "text-muted-foreground"}`}>{label}</p>
  </Card>
);

export default Affiliate;