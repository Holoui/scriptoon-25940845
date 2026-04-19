import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Shield, Users, FileText, CreditCard, Loader2, Check, X, Mail, MessageCircle } from "lucide-react";
import { AdminChatPanel } from "@/components/AdminChatPanel";

type Payment = {
  id: string;
  user_id: string;
  tier: "free" | "pro" | "premium";
  amount: number;
  currency: string;
  status: "pending" | "successful" | "failed";
  phone_number: string | null;
  external_reference: string | null;
  created_at: string;
};

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [scripts, setScripts] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [unreadChats, setUnreadChats] = useState(0);

  const profileFor = (uid: string) => profiles.find((p) => p.id === uid);

  const load = async () => {
    const [p, s, pay, sub, msgs, threads] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("scripts").select("id, title, genre, status, user_id, updated_at").order("updated_at", { ascending: false }),
      supabase.from("payments").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("*"),
      supabase.from("contact_messages").select("*").order("created_at", { ascending: false }),
      supabase.from("support_threads").select("unread_for_admin").eq("unread_for_admin", true),
    ]);
    setProfiles(p.data ?? []);
    setScripts(s.data ?? []);
    setPayments((pay.data ?? []) as Payment[]);
    setSubs(sub.data ?? []);
    setContacts(msgs.data ?? []);
    setUnreadChats(threads.data?.length ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_threads" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const approve = async (pmt: Payment) => {
    setActing(pmt.id);
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    // Update payment status
    const { error: payErr } = await supabase
      .from("payments")
      .update({ status: "successful" })
      .eq("id", pmt.id);
    if (payErr) {
      toast({ title: "Couldn't update payment", description: payErr.message, variant: "destructive" });
      setActing(null);
      return;
    }

    // Upgrade subscription
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", pmt.user_id)
      .maybeSingle();

    const subPayload = {
      user_id: pmt.user_id,
      tier: pmt.tier,
      current_period_end: periodEnd.toISOString(),
    };

    const { error: subErr } = existing
      ? await supabase.from("subscriptions").update(subPayload).eq("user_id", pmt.user_id)
      : await supabase.from("subscriptions").insert(subPayload);

    if (subErr) {
      toast({ title: "Couldn't upgrade user", description: subErr.message, variant: "destructive" });
      setActing(null);
      return;
    }

    toast({ title: "Approved ✓", description: `User upgraded to ${pmt.tier}` });
    setActing(null);
    load();
  };

  const reject = async (pmt: Payment) => {
    setActing(pmt.id);
    const { error } = await supabase.from("payments").update({ status: "failed" }).eq("id", pmt.id);
    setActing(null);
    if (error) {
      toast({ title: "Couldn't reject", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Payment rejected" });
    load();
  };

  const stats = [
    { icon: Users, label: "Users", value: profiles.length },
    { icon: FileText, label: "Scripts", value: scripts.length },
    { icon: CreditCard, label: "Pending payments", value: payments.filter((p) => p.status === "pending").length },
    { icon: Shield, label: "Active subs", value: subs.filter((s) => s.tier !== "free").length },
  ];

  if (loading) {
    return <Layout><div className="container py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></Layout>;
  }

  const pending = payments.filter((p) => p.status === "pending");
  const others = payments.filter((p) => p.status !== "pending");

  return (
    <Layout>
      <div className="container py-8 md:py-12">
        <div className="mb-8">
          <Badge className="mb-2 bg-gradient-hero text-white border-0"><Shield className="h-3 w-3 mr-1" /> Admin</Badge>
          <h1 className="font-display text-4xl md:text-5xl font-black">Control center</h1>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((s) => (
            <Card key={s.label} className="p-5 bg-gradient-card border-border/60">
              <div className="flex items-center justify-between mb-2">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-hero text-white"><s.icon className="h-5 w-5" /></span>
              </div>
              <p className="text-3xl font-display font-black">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="payments">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="payments">
              Payments {pending.length > 0 && <Badge className="ml-2 bg-destructive text-destructive-foreground">{pending.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageCircle className="h-4 w-4 mr-1" /> Support chat
              {unreadChats > 0 && <Badge className="ml-2 bg-destructive text-destructive-foreground">{unreadChats}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="messages">
              <Mail className="h-4 w-4 mr-1" /> Contact ({contacts.length})
            </TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="scripts">Scripts</TabsTrigger>
          </TabsList>

          <TabsContent value="payments" className="space-y-6">
            <div>
              <h2 className="font-display text-2xl font-bold mb-3">Pending approvals</h2>
              {pending.length === 0 ? (
                <Card className="p-6 text-center text-muted-foreground">No pending payments 🎉</Card>
              ) : (
                <div className="grid gap-3">
                  {pending.map((p) => {
                    const prof = profileFor(p.user_id);
                    return (
                      <Card key={p.id} className="p-5 bg-gradient-card border-border/60">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="capitalize bg-gradient-hero text-white border-0">{p.tier}</Badge>
                              <span className="font-display text-xl font-bold">{p.currency} {Number(p.amount).toFixed(2)}</span>
                              {p.external_reference && <Badge variant="secondary" className="font-mono">{p.external_reference}</Badge>}
                            </div>
                            <p className="text-sm">
                              <span className="font-semibold">{prof?.display_name ?? "—"}</span>
                              <span className="text-muted-foreground"> · {prof?.email ?? p.user_id.slice(0, 8)}</span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Paid from MoMo: <span className="font-mono text-foreground">{p.phone_number ?? "—"}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Submitted {new Date(p.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reject(p)}
                              disabled={acting === p.id}
                            >
                              <X className="h-4 w-4 mr-1" /> Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => approve(p)}
                              disabled={acting === p.id}
                              className="bg-gradient-hero text-white border-0 hover:opacity-90"
                            >
                              {acting === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Approve & upgrade</>}
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
              <h2 className="font-display text-2xl font-bold mb-3">History</h2>
              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>User</TableHead><TableHead>Tier</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Reference</TableHead><TableHead>Date</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {others.map((p) => {
                      const prof = profileFor(p.user_id);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{prof?.email ?? p.user_id.slice(0, 8)}</TableCell>
                          <TableCell className="capitalize">{p.tier}</TableCell>
                          <TableCell>{p.currency} {Number(p.amount).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={p.status === "successful" ? "default" : "destructive"}>{p.status}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{p.external_reference ?? "—"}</TableCell>
                          <TableCell className="text-xs">{new Date(p.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      );
                    })}
                    {others.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No history yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Tier</TableHead><TableHead>Joined</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => {
                    const sub = subs.find((s) => s.user_id === p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>{p.display_name ?? "—"}</TableCell>
                        <TableCell>{p.email ?? "—"}</TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize">{sub?.tier ?? "free"}</Badge></TableCell>
                        <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="scripts">
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Title</TableHead><TableHead>Genre</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {scripts.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.title}</TableCell>
                      <TableCell>{s.genre ?? "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{s.status}</Badge></TableCell>
                      <TableCell>{new Date(s.updated_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="chat">
            <AdminChatPanel profiles={profiles} />
          </TabsContent>

          <TabsContent value="messages">
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>From</TableHead><TableHead>Email</TableHead><TableHead>Message</TableHead><TableHead>Received</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No contact messages yet</TableCell></TableRow>
                  )}
                  {contacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a>
                      </TableCell>
                      <TableCell className="max-w-md whitespace-pre-wrap text-sm">{c.message}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(c.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Admin;
