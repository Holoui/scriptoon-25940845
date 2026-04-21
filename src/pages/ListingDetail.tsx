import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Phone, Mail, MessageCircle, Tag, Trash2, CheckCircle2 } from "lucide-react";

const ListingDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<any | null>(null);
  const [seller, setSeller] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const { data } = await supabase.from("script_listings").select("*").eq("id", id).maybeSingle();
      setListing(data);
      if (data) {
        const { data: ex } = await supabase.from("profile_extras").select("*").eq("user_id", data.user_id).maybeSingle();
        setSeller(ex);
      }
      setLoading(false);
    })();
  }, [id]);

  const contactSeller = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!listing) return;
    // Open a support thread between buyer and admin so admins can mediate.
    // Sellers will be notified via in-app notification.
    const subject = `Interest in "${listing.title}"`;
    const { data: thread, error } = await supabase
      .from("support_threads")
      .insert({ user_id: user.id, subject, status: "open" })
      .select("id")
      .single();
    if (error || !thread) {
      toast({ title: "Couldn't open chat", description: error?.message, variant: "destructive" });
      return;
    }
    await supabase.from("support_messages").insert({
      thread_id: thread.id,
      sender_id: user.id,
      sender_role: "user",
      body: `Hi! I'm interested in the script "${listing.title}" (GHS ${Number(listing.price_ghs).toFixed(2)}). Please connect me with the seller.`,
    });
    // Notify the seller in-app
    await supabase.from("notifications").insert({
      user_id: listing.user_id,
      kind: "listing_interest",
      title: `Someone is interested in "${listing.title}"`,
      body: "A buyer reached out via the marketplace. Check your support chat for details.",
    });
    toast({ title: "Message sent! 🎉", description: "An admin will connect you with the seller shortly." });
  };

  const markSold = async () => {
    if (!listing) return;
    if (!confirm("Mark this listing as sold? It will be hidden from the marketplace.")) return;
    const { error } = await supabase.from("script_listings").update({ status: "sold" }).eq("id", listing.id);
    if (error) { toast({ title: "Couldn't update", description: error.message, variant: "destructive" }); return; }
    setListing({ ...listing, status: "sold" });
    toast({ title: "Marked as sold ✓" });
  };

  const withdraw = async () => {
    if (!listing) return;
    if (!confirm("Remove this listing from the marketplace?")) return;
    const { error } = await supabase.from("script_listings").delete().eq("id", listing.id);
    if (error) { toast({ title: "Couldn't remove", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Listing removed" });
    navigate("/marketplace");
  };

  if (loading) return <Layout><div className="container py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></Layout>;
  if (!listing) return <Layout><div className="container py-20 text-center"><p className="text-muted-foreground mb-4">Listing not found.</p><Button asChild><Link to="/marketplace">Back to marketplace</Link></Button></div></Layout>;

  const isOwner = user?.id === listing.user_id;
  const sellerName = seller?.display_name ?? "Anonymous";

  return (
    <Layout>
      <div className="container py-8 md:py-12 max-w-3xl">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/marketplace"><ArrowLeft className="mr-2 h-4 w-4" /> Marketplace</Link>
        </Button>

        <Card className="p-6 md:p-8 bg-gradient-card border-border/60">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {listing.genre && <Badge variant="secondary"><Tag className="h-3 w-3 mr-1" /> {listing.genre}</Badge>}
              {listing.status === "sold" && <Badge variant="outline">SOLD</Badge>}
            </div>
            <Badge className="bg-gradient-hero text-white border-0 text-base px-3 py-1">GHS {Number(listing.price_ghs).toFixed(2)}</Badge>
          </div>

          <h1 className="font-display text-3xl md:text-4xl font-black mb-3">{listing.title}</h1>

          <Link to={`/u/${listing.user_id}`} className="flex items-center gap-3 group mb-6">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">{(sellerName[0] ?? "U").toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold group-hover:text-primary transition-colors">{sellerName}</p>
              <p className="text-xs text-muted-foreground">Listed {new Date(listing.created_at).toLocaleDateString()}</p>
            </div>
          </Link>

          <section className="space-y-4">
            <div>
              <h2 className="font-display text-lg font-bold mb-1">Pitch</h2>
              <p className="whitespace-pre-wrap">{listing.pitch}</p>
            </div>
            {listing.preview && (
              <div>
                <h2 className="font-display text-lg font-bold mb-1">Preview</h2>
                <pre className="whitespace-pre-wrap font-mono-screenplay text-sm bg-muted/40 rounded-xl p-4 border border-border/40 max-h-80 overflow-y-auto">
                  {listing.preview}
                </pre>
              </div>
            )}
          </section>

          <div className="border-t border-border/60 mt-6 pt-6">
            {isOwner ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={markSold} disabled={listing.status === "sold"}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark as sold
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={withdraw}>
                  <Trash2 className="mr-2 h-4 w-4" /> Remove listing
                </Button>
              </div>
            ) : listing.status === "active" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Payment & delivery happen <strong>off-platform</strong>. Contact the seller below.</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={contactSeller} className="bg-gradient-hero text-white border-0 hover:opacity-90">
                    <MessageCircle className="mr-2 h-4 w-4" /> Express interest
                  </Button>
                  {listing.contact_phone && (
                    <Button asChild variant="outline">
                      <a href={`tel:${listing.contact_phone}`}><Phone className="mr-2 h-4 w-4" /> {listing.contact_phone}</a>
                    </Button>
                  )}
                  {listing.contact_email && (
                    <Button asChild variant="outline">
                      <a href={`mailto:${listing.contact_email}`}><Mail className="mr-2 h-4 w-4" /> Email</a>
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">This script is no longer available.</p>
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default ListingDetail;