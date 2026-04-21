import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { MoMoPaymentDialog } from "@/components/MoMoPaymentDialog";

type Tier = "pro" | "premium";

const tiers = [
  {
    id: "free" as const,
    name: "Free",
    price: 0,
    icon: Sparkles,
    blurb: "Perfect for trying things out.",
    features: [
      "Up to 12 pages / 6,000 words",
      "5 generations per 24h",
      "1 Extend per 24h",
      "PDF + DOCX export (with watermark)",
    ],
    cta: "Current plan",
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: 50,
    icon: Zap,
    blurb: "For serious storytellers.",
    features: [
      "Up to 60 pages / 30,000 words",
      "20 generations per 24h",
      "Unlimited Extend",
      "Movie or series scripts",
      "2 watermark-free exports per day",
      "Version history",
    ],
    cta: "Upgrade with MoMo",
    highlight: true,
  },
  {
    id: "premium" as const,
    name: "Premium",
    price: 150,
    icon: Crown,
    blurb: "Studio-grade output & control.",
    features: [
      "Up to 500 pages / 115,000 words",
      "Unlimited daily generations",
      "Unlimited Extend",
      "Watermark-free PDF + DOCX, forever",
      "Rich character development",
      "Early access features",
    ],
    cta: "Go Premium",
  },
];

const Pricing = () => {
  const { user, tier } = useAuth();
  const navigate = useNavigate();
  const [openTier, setOpenTier] = useState<Tier | null>(null);

  const handleClick = (id: "free" | Tier) => {
    if (!user) { navigate("/auth"); return; }
    if (id === "free") return;
    setOpenTier(id);
  };

  return (
    <Layout>
      <div className="container py-12 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/30 border border-secondary/40 text-sm font-medium mb-4">
            <Crown className="h-4 w-4 text-primary" /> Plans for every storyteller
          </span>
          <h1 className="font-display text-4xl md:text-6xl font-black mb-4 text-balance">
            Simple pricing, <span className="bg-gradient-hero bg-clip-text text-transparent">powered by MoMo</span>
          </h1>
          <p className="text-muted-foreground text-lg">Pay with MTN Mobile Money in Ghana Cedis — no card required.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {tiers.map((t, i) => {
            const isCurrent = tier === t.id;
            return (
              <Card
                key={t.id}
                className={`p-6 md:p-8 flex flex-col bg-gradient-card border-border/60 hover:shadow-playful transition-all duration-300 animate-fade-in ${
                  t.highlight ? "ring-2 ring-primary shadow-playful md:-translate-y-2" : ""
                }`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {t.highlight && (
                  <Badge className="self-start mb-3 bg-gradient-hero text-white border-0">Most popular</Badge>
                )}
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-hero text-white mb-4 shadow-playful">
                  <t.icon className="h-6 w-6" />
                </div>
                <h3 className="font-display text-2xl font-bold">{t.name}</h3>
                <p className="text-muted-foreground text-sm mb-4">{t.blurb}</p>
                <div className="mb-6">
                  <span className="font-display text-4xl font-black">GHS {t.price}</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className={t.highlight ? "bg-gradient-hero text-white border-0 hover:opacity-90 shadow-playful" : ""}
                  variant={t.highlight ? "default" : "outline"}
                  disabled={isCurrent}
                  onClick={() => handleClick(t.id)}
                >
                  {isCurrent ? "Your current plan" : t.cta}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>

      <MoMoPaymentDialog
        open={!!openTier}
        onOpenChange={(o) => !o && setOpenTier(null)}
        tier={openTier ?? "pro"}
        amount={openTier === "premium" ? 150 : 50}
      />
    </Layout>
  );
};

export default Pricing;
