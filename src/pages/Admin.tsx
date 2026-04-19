import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Users, FileText, CreditCard, Loader2 } from "lucide-react";

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [scripts, setScripts] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const [p, s, pay, sub] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("scripts").select("id, title, genre, status, user_id, updated_at").order("updated_at", { ascending: false }),
        supabase.from("payments").select("*").order("created_at", { ascending: false }),
        supabase.from("subscriptions").select("*"),
      ]);
      setProfiles(p.data ?? []);
      setScripts(s.data ?? []);
      setPayments(pay.data ?? []);
      setSubs(sub.data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const stats = [
    { icon: Users, label: "Users", value: profiles.length },
    { icon: FileText, label: "Scripts", value: scripts.length },
    { icon: CreditCard, label: "Payments", value: payments.length },
    { icon: Shield, label: "Active subs", value: subs.filter((s) => s.tier !== "free").length },
  ];

  if (loading) {
    return <Layout><div className="container py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></Layout>;
  }

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

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="scripts">Scripts</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Joined</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.display_name ?? "—"}</TableCell>
                      <TableCell>{p.email ?? "—"}</TableCell>
                      <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
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

          <TabsContent value="payments">
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Tier</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Phone</TableHead><TableHead>Date</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="capitalize">{p.tier}</TableCell>
                      <TableCell>{p.currency} {p.amount}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "successful" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>{p.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.phone_number ?? "—"}</TableCell>
                      <TableCell>{new Date(p.created_at).toLocaleString()}</TableCell>
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
