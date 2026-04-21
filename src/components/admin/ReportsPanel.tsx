import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Check, X, Ban, ShieldAlert, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  post_id: string | null;
  reason: string;
  details: string | null;
  status: "open" | "dismissed" | "actioned";
  admin_notes: string | null;
  created_at: string;
}

export function ReportsPanel() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [bans, setBans] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const [r, b] = await Promise.all([
      supabase.from("user_reports").select("*").order("created_at", { ascending: false }),
      supabase.from("user_bans").select("user_id"),
    ]);
    const items = (r.data as Report[]) ?? [];
    setReports(items);
    setBans(new Set(((b.data as any[]) ?? []).map((x) => x.user_id)));
    if (items.length) {
      const ids = Array.from(new Set(items.flatMap((x) => [x.reporter_id, x.reported_user_id])));
      const { data: ps } = await supabase.from("profiles").select("id, display_name, email").in("id", ids);
      const map: Record<string, any> = {};
      (ps ?? []).forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const dismiss = async (r: Report) => {
    setActing(r.id);
    await supabase.from("user_reports").update({
      status: "dismissed",
      admin_notes: notes[r.id] ?? null,
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
    }).eq("id", r.id);
    setActing(null);
    load();
    toast({ title: "Report dismissed" });
  };

  const warn = async (r: Report) => {
    setActing(r.id);
    await supabase.from("notifications").insert({
      user_id: r.reported_user_id,
      kind: "moderation_warning",
      title: "Warning from ScriptToon moderators",
      body: `Your account was reported for "${r.reason}". Please review our community guidelines. ${notes[r.id] ?? ""}`.trim(),
    });
    await supabase.from("user_reports").update({
      status: "actioned",
      admin_notes: `WARNED. ${notes[r.id] ?? ""}`.trim(),
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
    }).eq("id", r.id);
    setActing(null);
    load();
    toast({ title: "User warned" });
  };

  const ban = async (r: Report) => {
    if (!confirm(`Ban ${profiles[r.reported_user_id]?.display_name ?? "this user"}? They will be blocked from posting, commenting, and listing.`)) return;
    setActing(r.id);
    const { error } = await supabase.from("user_bans").upsert({
      user_id: r.reported_user_id,
      reason: notes[r.id] ?? r.reason,
      banned_by: user!.id,
    }, { onConflict: "user_id" });
    if (error) { toast({ title: "Ban failed", description: error.message, variant: "destructive" }); setActing(null); return; }
    await supabase.from("notifications").insert({
      user_id: r.reported_user_id,
      kind: "moderation_banned",
      title: "Your account has been suspended",
      body: `Reason: ${notes[r.id] ?? r.reason}. Contact support to appeal.`,
    });
    await supabase.from("user_reports").update({
      status: "actioned",
      admin_notes: `BANNED. ${notes[r.id] ?? ""}`.trim(),
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
    }).eq("id", r.id);
    setActing(null);
    load();
    toast({ title: "User banned" });
  };

  const unban = async (userId: string) => {
    await supabase.from("user_bans").delete().eq("user_id", userId);
    load();
    toast({ title: "Ban lifted" });
  };

  if (loading) return <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const open = reports.filter((r) => r.status === "open");
  const resolved = reports.filter((r) => r.status !== "open");

  const renderReport = (r: Report) => {
    const reporter = profiles[r.reporter_id];
    const reported = profiles[r.reported_user_id];
    const isBanned = bans.has(r.reported_user_id);
    return (
      <Card key={r.id} className="p-5 bg-gradient-card border-border/60">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="space-y-1">
            <div className="flex gap-2 items-center flex-wrap">
              <Badge variant="destructive" className="capitalize"><Flag className="h-3 w-3 mr-1" /> {r.reason}</Badge>
              {isBanned && <Badge variant="outline" className="border-destructive text-destructive"><Ban className="h-3 w-3 mr-1" /> Banned</Badge>}
              <Badge variant="secondary" className="capitalize">{r.status}</Badge>
            </div>
            <p className="text-sm">
              <span className="text-muted-foreground">Reporting: </span>
              <Link to={`/u/${r.reported_user_id}`} className="font-semibold hover:text-primary">{reported?.display_name ?? reported?.email ?? r.reported_user_id.slice(0, 8)}</Link>
            </p>
            <p className="text-xs text-muted-foreground">
              By {reporter?.display_name ?? reporter?.email ?? r.reporter_id.slice(0, 8)} · {new Date(r.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        {r.details && <p className="text-sm bg-muted/40 rounded-lg p-3 mb-3 whitespace-pre-wrap">{r.details}</p>}
        {r.admin_notes && <p className="text-xs text-muted-foreground italic mb-3">Notes: {r.admin_notes}</p>}

        {r.status === "open" && (
          <>
            <Textarea
              value={notes[r.id] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              placeholder="Optional notes / message included in the warning or ban"
              rows={2}
              className="mb-3"
            />
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => dismiss(r)} disabled={acting === r.id}>
                <X className="mr-2 h-4 w-4" /> Dismiss
              </Button>
              <Button size="sm" variant="outline" onClick={() => warn(r)} disabled={acting === r.id}>
                <ShieldAlert className="mr-2 h-4 w-4" /> Warn
              </Button>
              <Button size="sm" variant="destructive" onClick={() => ban(r)} disabled={acting === r.id || isBanned}>
                {acting === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Ban className="mr-2 h-4 w-4" /> Ban user</>}
              </Button>
              {isBanned && (
                <Button size="sm" variant="ghost" onClick={() => unban(r.reported_user_id)}>
                  <Check className="mr-2 h-4 w-4" /> Lift ban
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
    );
  };

  return (
    <Tabs defaultValue="open">
      <TabsList>
        <TabsTrigger value="open">Open ({open.length})</TabsTrigger>
        <TabsTrigger value="resolved">Resolved ({resolved.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="open" className="space-y-3 mt-4">
        {open.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No open reports 🎉</Card>
        ) : open.map(renderReport)}
      </TabsContent>
      <TabsContent value="resolved" className="space-y-3 mt-4">
        {resolved.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No resolved reports yet.</Card>
        ) : resolved.map(renderReport)}
      </TabsContent>
    </Tabs>
  );
}