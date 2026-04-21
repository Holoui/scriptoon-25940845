import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Heart, MessageCircle, Share2, Loader2, Users, Send, Trash2, Flag } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ReportUserDialog } from "@/components/ReportUserDialog";

interface Post {
  id: string;
  user_id: string;
  title: string;
  excerpt: string | null;
  body: string;
  genre: string | null;
  author_name: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
}

interface Comment {
  id: string;
  user_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

const initials = (name?: string | null) =>
  (name ?? "U").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "U";

const Community = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [posting, setPosting] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ userId: string; name: string; postId: string } | null>(null);

  const loadFeed = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("community_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast({ title: "Couldn't load feed", description: error.message, variant: "destructive" });
    } else {
      setPosts((data as Post[]) ?? []);
    }
    if (user && data?.length) {
      const { data: liked } = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("user_id", user.id)
        .in("post_id", data.map((p: any) => p.id));
      setLikedIds(new Set((liked ?? []).map((l: any) => l.post_id)));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const toggleLike = async (post: Post) => {
    if (!user) {
      toast({ title: "Sign in to like posts" });
      return;
    }
    const liked = likedIds.has(post.id);
    // Optimistic
    setLikedIds((s) => {
      const next = new Set(s);
      liked ? next.delete(post.id) : next.add(post.id);
      return next;
    });
    setPosts((ps) => ps.map((p) => p.id === post.id ? { ...p, likes_count: p.likes_count + (liked ? -1 : 1) } : p));
    if (liked) {
      await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
    } else {
      const { error } = await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id });
      if (error && !error.message.includes("duplicate")) {
        toast({ title: "Couldn't like", description: error.message, variant: "destructive" });
      }
    }
  };

  const sharePost = async (post: Post) => {
    const url = `${window.location.origin}/community#post-${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, text: post.excerpt ?? "", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied" });
      }
    } catch { /* user cancelled */ }
  };

  const openComments = async (post: Post) => {
    setOpenPost(post);
    setLoadingComments(true);
    const { data } = await supabase
      .from("post_comments")
      .select("*")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });
    setComments((data as Comment[]) ?? []);
    setLoadingComments(false);
  };

  const addComment = async () => {
    if (!user || !openPost || !commentText.trim()) return;
    setPosting(true);
    const authorName = user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "User";
    const { data, error } = await supabase
      .from("post_comments")
      .insert({ post_id: openPost.id, user_id: user.id, body: commentText.trim(), author_name: authorName })
      .select("*")
      .single();
    setPosting(false);
    if (error) {
      toast({ title: "Couldn't post comment", description: error.message, variant: "destructive" });
      return;
    }
    setComments((c) => [...c, data as Comment]);
    setPosts((ps) => ps.map((p) => p.id === openPost.id ? { ...p, comments_count: p.comments_count + 1 } : p));
    setCommentText("");
  };

  const deleteComment = async (c: Comment) => {
    if (!user || c.user_id !== user.id) return;
    await supabase.from("post_comments").delete().eq("id", c.id);
    setComments((cs) => cs.filter((x) => x.id !== c.id));
    if (openPost) setPosts((ps) => ps.map((p) => p.id === openPost.id ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p));
  };

  const deletePost = async (post: Post) => {
    if (!user || post.user_id !== user.id) return;
    if (!confirm("Unpublish this post? It will be removed from the community feed.")) return;
    const { error } = await supabase.from("community_posts").delete().eq("id", post.id);
    if (error) {
      toast({ title: "Couldn't unpublish", description: error.message, variant: "destructive" });
      return;
    }
    setPosts((ps) => ps.filter((p) => p.id !== post.id));
    toast({ title: "Post removed" });
  };

  return (
    <Layout>
      <div className="container py-8 md:py-12 max-w-3xl">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/30 border border-secondary/40 text-sm font-medium mb-4">
            <Users className="h-4 w-4 text-primary" /> Community
          </span>
          <h1 className="font-display text-4xl md:text-5xl font-black mb-2">Stories from writers</h1>
          <p className="text-muted-foreground">Read, react, and discuss screenplays shared by the ScriptToon community.</p>
          {user && (
            <Button asChild className="mt-5 bg-gradient-hero text-white border-0 hover:opacity-90">
              <Link to="/dashboard">Publish one of your scripts →</Link>
            </Button>
          )}
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : posts.length === 0 ? (
          <Card className="p-10 text-center bg-gradient-card border-border/60">
            <p className="text-muted-foreground">No posts yet. Be the first to publish a script from your dashboard!</p>
          </Card>
        ) : (
          <div className="space-y-5">
            {posts.map((post) => {
              const liked = likedIds.has(post.id);
              return (
                <Card key={post.id} id={`post-${post.id}`} className="p-5 md:p-6 bg-gradient-card border-border/60 hover:shadow-soft transition-shadow">
                  <div className="flex items-start gap-3 mb-3">
                    <Link to={`/u/${post.user_id}`}>
                      <Avatar className="h-10 w-10 hover:ring-2 hover:ring-primary transition-all">
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials(post.author_name)}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link to={`/u/${post.user_id}`} className="font-semibold truncate hover:text-primary">
                          {post.author_name ?? "Anonymous"}
                        </Link>
                        {post.genre && <Badge variant="secondary" className="text-xs">{post.genre}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{new Date(post.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {user && user.id !== post.user_id && (
                        <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label="Report"
                          onClick={() => setReportTarget({ userId: post.user_id, name: post.author_name ?? "User", postId: post.id })}>
                          <Flag className="h-4 w-4" />
                        </Button>
                      )}
                      {user?.id === post.user_id && (
                        <Button size="icon" variant="ghost" onClick={() => deletePost(post)} aria-label="Unpublish">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <h2 className="font-display text-2xl font-bold mb-2">{post.title}</h2>
                  {post.excerpt && <p className="text-muted-foreground mb-3">{post.excerpt}</p>}
                  <pre className="whitespace-pre-wrap font-mono-screenplay text-sm bg-muted/40 rounded-xl p-4 max-h-72 overflow-hidden border border-border/40 relative">
                    {post.body.slice(0, 1500)}
                    {post.body.length > 1500 && (
                      <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-muted/80 to-transparent pointer-events-none" />
                    )}
                  </pre>

                  <div className="flex items-center gap-1 mt-4 -ml-2">
                    <Button variant="ghost" size="sm" onClick={() => toggleLike(post)} className={liked ? "text-primary" : ""}>
                      <Heart className={`mr-2 h-4 w-4 ${liked ? "fill-current" : ""}`} />
                      {post.likes_count}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openComments(post)}>
                      <MessageCircle className="mr-2 h-4 w-4" /> {post.comments_count}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => sharePost(post)}>
                      <Share2 className="mr-2 h-4 w-4" /> Share
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Sheet open={!!openPost} onOpenChange={(o) => !o && setOpenPost(null)}>
          <SheetContent className="w-full sm:max-w-lg flex flex-col">
            <SheetHeader>
              <SheetTitle className="text-left">{openPost?.title}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {loadingComments ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">Be the first to comment.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-3 group">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">{initials(c.author_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="rounded-2xl bg-muted/60 px-3 py-2">
                        <p className="text-xs font-semibold">{c.author_name ?? "User"}</p>
                        <p className="text-sm whitespace-pre-wrap break-words">{c.body}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1 px-1">
                        <p className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
                        {user?.id === c.user_id && (
                          <button onClick={() => deleteComment(c)} className="text-[10px] text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100">Delete</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {user ? (
              <div className="border-t border-border/60 pt-3 flex items-end gap-2">
                <Textarea
                  rows={2}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment…"
                  className="resize-none"
                />
                <Button size="icon" onClick={addComment} disabled={posting || !commentText.trim()}>
                  {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center border-t border-border/60 pt-3">
                <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to join the conversation.
              </p>
            )}
          </SheetContent>
        </Sheet>
        {reportTarget && (
          <ReportUserDialog
            open={!!reportTarget}
            onOpenChange={(o) => !o && setReportTarget(null)}
            reportedUserId={reportTarget.userId}
            reportedUserName={reportTarget.name}
            postId={reportTarget.postId}
          />
        )}
      </div>
    </Layout>
  );
};

export default Community;
