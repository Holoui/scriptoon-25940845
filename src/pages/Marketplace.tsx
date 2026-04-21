import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Tag, Search, Crown, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface Listing {
  id: string;
  user_id: string;
  title: string;
  pitch: string;
  preview: string | null;
  genre: string | null;
  price_ghs: number;
  created_at: string;
}

const Marketplace = () => {
  const { tier } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("script_listings")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(60);
      const items = (data as Listing[]) ?? [];
      setListings(items);
      if (items.length) {
        const ids = Array.from(new Set(items.map((l) => l.user_id)));
        const { data: ex } = await supabase.from("profile_extras").select("user_id, display_name").in("user_id", ids);
        const map: Record<string, string> = {};
        (ex ?? []).forEach((e: any) => { if (e.display_name) map[e.user_id] = e.display_name; });
        setAuthors(map);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = listings.filter((l) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return l.title.toLowerCase().includes(term) || (l.genre ?? "").toLowerCase().includes(term) || l.pitch.toLowerCase().includes(term);
  });

  const canSell = tier === "pro" || tier === "premium";

  return (
    <Layout>
      <div className="container py-8 md:py-12 max-w-6xl">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/30 border border-secondary/40 text-sm font-medium mb-4">
            <Tag className="h-4 w-4 text-primary" /> Marketplace
          </span>
          <h1 className="font-display text-4xl md:text-5xl font-black mb-2">Buy original screenplays</h1>
          <p className="text-muted-foreground">Discover scripts from Pro & Premium writers. Contact sellers directly to negotiate.</p>
          <div className="mt-5 flex justify-center gap-2 flex-wrap">
            {canSell ? (
              <Button asChild className="bg-gradient-hero text-white border-0 hover:opacity-90">
                <Link to="/dashboard">List one of your scripts →</Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link to="/pricing"><Crown className="mr-2 h-4 w-4" /> Upgrade to sell scripts</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, genre, or keyword…" className="pl-10" />
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center bg-gradient-card border-border/60">
            <Sparkles className="h-8 w-8 mx-auto text-primary mb-3" />
            <p className="text-muted-foreground">{q ? "No listings match your search." : "No scripts for sale yet — be the first!"}</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((l) => (
              <Card key={l.id} className="p-5 bg-gradient-card border-border/60 hover:shadow-playful transition-shadow flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                  {l.genre && <Badge variant="secondary" className="text-xs">{l.genre}</Badge>}
                  <Badge className="bg-gradient-hero text-white border-0 ml-auto whitespace-nowrap">GHS {Number(l.price_ghs).toFixed(2)}</Badge>
                </div>
                <h3 className="font-display text-xl font-bold mb-1">{l.title}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  by <Link to={`/u/${l.user_id}`} className="hover:text-primary">{authors[l.user_id] ?? "Anonymous"}</Link>
                </p>
                <p className="text-sm text-muted-foreground line-clamp-3 flex-1">{l.pitch}</p>
                <Button asChild size="sm" className="mt-4 w-full bg-gradient-hero text-white border-0 hover:opacity-90">
                  <Link to={`/marketplace/${l.id}`}>View details →</Link>
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Marketplace;