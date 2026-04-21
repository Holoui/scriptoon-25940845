import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2, Flag, Save, Users, FileText, Tag, Edit3 } from "lucide-react";
import { FollowButton } from "@/components/FollowButton";
import { ReportUserDialog } from "@/components/ReportUserDialog";

const initials = (name?: string | null) =>
  (name ?? "U").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "U";

const Profile = () => {
  const { userId } = useParams();
  const { user } = useAuth();
  const isMe = user?.id === userId;

  const [loading, setLoading] = useState(true);
  const [extras, setExtras] = useState<{ display_name: string | null; bio: string | null; avatar_url: string | null } | null>(null);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [posts, setPosts] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftBio, setDraftBio] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    const [ex, f1, f2, ps, ls] = await Promise.all([
      supabase.from("profile_extras").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("followee_id", userId),
      supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
      supabase.from("community_posts").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      supabase.from("script_listings").select("*").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: false }),
    ]);
    setExtras(ex.data ?? { display_name: null, bio: null, avatar_url: null });
    setFollowers(f1.count ?? 0);
    setFollowing(f2.count ?? 0);
    setPosts(ps.data ?? []);
    setListings(ls.data ?? []);
    setDraftName(ex.data?.display_name ?? "");
    setDraftBio(ex.data?.bio ?? "");
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const payload = { user_id: user.id, display_name: draftName.trim() || null, bio: draftBio.trim() || null };
    const { error } = await supabase.from("profile_extras").upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Profile updated" });
    setEditing(false);
    load();
  };

  if (loading) {
    return (
      <Layout><div className="container py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></Layout>
    );
  }

  const displayName = extras?.display_name ?? "Storyteller";

  return (
    <Layout>
      <div className="container py-8 md:py-12 max-w-4xl">
        <Card className="p-6 md:p-8 bg-gradient-card border-border/60">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <Avatar className="h-24 w-24 ring-4 ring-primary/20">
              {extras?.avatar_url && <AvatarImage src={extras.avatar_url} alt={displayName} />}
              <AvatarFallback className="bg-gradient-hero text-white text-2xl font-display font-bold">
                {initials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 w-full">
              {editing && isMe ? (
                <div className="space-y-3">
                  <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Display name" />
                  <Textarea value={draftBio} onChange={(e) => setDraftBio(e.target.value)} placeholder="A short bio…" rows={3} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveProfile} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Save</>}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="font-display text-3xl md:text-4xl font-black">{displayName}</h1>
                  {extras?.bio && <p className="text-muted-foreground mt-2 whitespace-pre-wrap">{extras.bio}</p>}
                </>
              )}

              <div className="flex flex-wrap items-center gap-4 mt-4 text-sm">
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-muted-foreground" /> <strong>{followers}</strong> followers</span>
                <span className="flex items-center gap-1.5"><strong>{following}</strong> following</span>
                <span className="flex items-center gap-1.5"><FileText className="h-4 w-4 text-muted-foreground" /> <strong>{posts.length}</strong> posts</span>
                {listings.length > 0 && <span className="flex items-center gap-1.5"><Tag className="h-4 w-4 text-muted-foreground" /> <strong>{listings.length}</strong> for sale</span>}
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                {isMe ? (
                  !editing && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      <Edit3 className="mr-2 h-4 w-4" /> Edit profile
                    </Button>
                  )
                ) : (
                  <>
                    <FollowButton targetUserId={userId!} onChange={(f) => setFollowers((n) => n + (f ? 1 : -1))} />
                    {user && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setReportOpen(true)}>
                        <Flag className="mr-2 h-4 w-4" /> Report
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="posts" className="mt-8">
          <TabsList>
            <TabsTrigger value="posts">Posts ({posts.length})</TabsTrigger>
            <TabsTrigger value="listings">For sale ({listings.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="posts" className="space-y-4 mt-4">
            {posts.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">No published posts yet.</Card>
            ) : posts.map((p) => (
              <Card key={p.id} className="p-5 bg-gradient-card border-border/60">
                <Link to={`/community#post-${p.id}`} className="font-display text-xl font-bold hover:text-primary">{p.title}</Link>
                <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{p.excerpt ?? p.body.slice(0, 200)}</p>
                <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                  <span>❤️ {p.likes_count}</span>
                  <span>💬 {p.comments_count}</span>
                  <span>{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="listings" className="space-y-4 mt-4">
            {listings.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">No active listings.</Card>
            ) : listings.map((l) => (
              <Card key={l.id} className="p-5 bg-gradient-card border-border/60">
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <Link to={`/marketplace/${l.id}`} className="font-display text-xl font-bold hover:text-primary">{l.title}</Link>
                    {l.genre && <Badge variant="secondary" className="ml-2 text-xs">{l.genre}</Badge>}
                    <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{l.pitch}</p>
                  </div>
                  <Badge className="bg-gradient-hero text-white border-0 whitespace-nowrap">GHS {Number(l.price_ghs).toFixed(2)}</Badge>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
      {!isMe && userId && (
        <ReportUserDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          reportedUserId={userId}
          reportedUserName={displayName}
        />
      )}
    </Layout>
  );
};

export default Profile;