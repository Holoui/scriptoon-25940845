import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Check, X, DollarSign, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Row = {
  id: string; affiliate_user_id: string; amount: number; currency: string;
  provider: string; phone_number: string; account_name: string; status: string;
  admin_note: string | null; created_at: string; processed_at: string | null;
};

export const AffiliatePanel = ({ profiles }: { profiles: any[] }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [withdrawals, setWithdrawals] = useState<Row[]>([]);
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<Row | null>(null);
  const [note, setNote] = useState("");

  const profileFor = (uid: string) => profiles.find((p) => p.id === uid);

  const load = async () => {
    const [w, a, e, r] = await Promise.all([
      supabase.from("withdrawal_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("affiliates").select("*"),
      supabase.from("affiliate_earnings").select("*"),
      supabase.from("referrals").select("*"),
    ]);
    setWithdrawals((w.data ?? []) as any);
    setAffiliates(a.data ?? []);
    setEarnings(e.data ?? []);
    setReferrals(r.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-affiliate")
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const stats = (uid: string) => {
    const refs = referrals.filter((r) => r.affiliate_user_id === uid).length;
    const earned = earnings.filter((e) => e.affiliate_user_id === uid).reduce((s, r) => s + Number(r.amount), 0);
    const paid = withdrawals.filter((w) => w.affiliate_user_id === uid && w.status === "paid").reduce((s, r) => s + Number(r.amount), 0);
    const held = withdrawals.filter((w) => w.affiliate_user_id === uid && w.status !== "rejected").reduce((s, r) => s + Number(r.amount), 0);
    const available = Math.max(0, earned - held);
    return { refs, earned, paid, available };
  };

  const setStatus = async (row: Row, status: "approved" | "paid" | "rejected", adminNote?: string) => {
    setActing(row.id);
    const { error } = await supabase.from("withdrawal_requests").update({
      status,
      admin_note: adminNote ?? row.admin_note,
      processed_at: new Date().toISOString(),
      processed_by: user?.id ?? null,
    }).eq("id", row.id);
    if (!error && status === "paid") {
      // Mark corresponding earnings as paid up to this amount
      const uid = row.affiliate_user_id;
      const remaining = { v: Number(row.amount) };
      const { data: es } = await supabase.from("affiliate_earnings")
        .select("id, amount")
        .eq("affiliate_user_id", uid)
        .eq("status", "available")
        .order("created_at", { ascending: true });
      for (const e of es ?? []) {
        if (remaining.v <= 0) break;
        await supabase.from("affiliate_earnings").update({ status: "paid" }).eq("id", (e as any).id);
        remaining.v -= Number((e as any).amount);
      }
      // Notify user
      await supabase.from("notifications").insert({
        user_id: uid, kind: "withdrawal_paid",
        title: `Withdrawal of ${row.currency} ${row.amount} paid`,
        body: `Sent to ${row.provider.toUpperCase()} ${row.phone_number}.`,
      });
    }
    if (!error && status === "rejected") {
      await supabase.from("notifications").insert({
        user_id: row.affiliate_user_id, kind: "withdrawal_rejected",
        title: `Withdrawal request rejected`,
        body: adminNote || "Please contact support if you have questions.",
      });
    }
    setActing(null);
    if (error) { toast({ title: "Couldn't update", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Marked ${status}` });
    setRejectFor(null); setNote("");
    load();
  };

  if (loading) {
    return <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const pending = withdrawals.filter((w) => w.status === "pending" || w.status === "approved");
  const history = withdrawals.filter((w) => w.status === "paid" || w.status === "rejected");

  return (
    <div className="space-y-6">
      <Tabs defaultValue="withdrawals">
        <TabsList>
          <TabsTrigger value="withdrawals"><DollarSign className="h-4 w-4 mr-1" /> Withdrawals</TabsTrigger>
          <TabsTrigger value="affiliates"><Users className="h-4 w-4 mr-1" /> Affiliates</TabsTrigger>
        </TabsList>

        <TabsContent value="withdrawals" className="space-y-6">
          <div>
            <h3 className="font-display text-xl font-bold mb-3">Pending payouts</h3>
            {pending.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">No pending withdrawals</Card>
            ) : (
              <div className="grid gap-3">
                {pending.map((w) => {
                  const prof = profileFor(w.affiliate_user_id);
                  return (
                    <Card key={w.id} className="p-5 bg-gradient-card border-border/60">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-display text-xl font-bold">{w.currency} {Number(w.amount).toFixed(2)}</span>
                            <Badge variant="secondary" className="uppercase">{w.provider}</Badge>
                            <Badge variant={w.status === "approved" ? "default" : "secondary"} className="capitalize">{w.status}</Badge>
                          </div>
                          <p className="text-sm">
                            <span className="font-semibold">{prof?.display_name ?? "—"}</span>
                            <span className="text-muted-foreground"> · {prof?.email ?? w.affiliate_user_id.slice(0, 8)}</span>
                          </p>
                          <p className="text-sm">
                            Send to: <span className="font-mono font-semibold">{w.phone_number}</span> — <span className="font-semibold">{w.account_name}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">Requested {new Date(w.created_at).toLocaleString()}</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => setRejectFor(w)} disabled={acting === w.id}>
                            <X className="h-4 w-4 mr-1" /> Reject
                          </Button>
                          {w.status === "pending" && (
                            <Button size="sm" variant="secondary" onClick={() => setStatus(w, "approved")} disabled={acting === w.id}>
                              Approve
                            </Button>
                          )}
                          <Button size="sm" onClick={() => setStatus(w, "paid")} disabled={acting === w.id}
                            className="bg-gradient-hero text-white border-0 hover:opacity-90">
                            {acting === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Mark as paid</>}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-display text-xl font-bold mb-3">History</h3>
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Amount</TableHead><TableHead>Provider</TableHead><TableHead>Number</TableHead><TableHead>Status</TableHead><TableHead>Processed</TableHead></TableRow></TableHeader>
                <TableBody>
                  {history.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No history yet</TableCell></TableRow>}
                  {history.map((w) => {
                    const prof = profileFor(w.affiliate_user_id);
                    return (
                      <TableRow key={w.id}>
                        <TableCell className="text-sm">{prof?.email ?? w.affiliate_user_id.slice(0, 8)}</TableCell>
                        <TableCell>{w.currency} {Number(w.amount).toFixed(2)}</TableCell>
                        <TableCell className="uppercase text-xs">{w.provider}</TableCell>
                        <TableCell className="font-mono text-xs">{w.phone_number}</TableCell>
                        <TableCell><Badge variant={w.status === "paid" ? "default" : "destructive"}>{w.status}</Badge></TableCell>
                        <TableCell className="text-xs">{w.processed_at ? new Date(w.processed_at).toLocaleString() : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="affiliates">
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead><TableHead>Code</TableHead><TableHead>Referrals</TableHead>
                  <TableHead>Total earned</TableHead><TableHead>Available</TableHead><TableHead>Paid out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {affiliates.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No affiliates yet</TableCell></TableRow>}
                {affiliates.map((a) => {
                  const s = stats(a.user_id);
                  const prof = profileFor(a.user_id);
                  return (
                    <TableRow key={a.user_id}>
                      <TableCell>
                        <div className="font-medium">{prof?.display_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{prof?.email ?? a.user_id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{a.referral_code}</TableCell>
                      <TableCell>{s.refs}</TableCell>
                      <TableCell>GHS {s.earned.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">GHS {s.available.toFixed(2)}</TableCell>
                      <TableCell>GHS {s.paid.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejectFor} onOpenChange={(o) => { if (!o) { setRejectFor(null); setNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject withdrawal</DialogTitle>
            <DialogDescription>Add an optional reason so the user knows what happened.</DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectFor(null); setNote(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectFor && setStatus(rejectFor, "rejected", note)}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};