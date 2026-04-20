import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Separator } from "@/components/ui/separator";
import { Sparkles, Zap, FileText, Crown, Wand2, Download, PenLine, Quote, CheckCircle2, Stars } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import heroImage from "@/assets/landing-hero-scripttoon.jpg";
import pagesImage from "@/assets/landing-script-pages.jpg";

const Index = () => {
  const { user } = useAuth();

  const features = [
    { icon: Wand2, title: "AI screenplay engine", desc: "Logline, synopsis, full script — generated in seconds." },
    { icon: PenLine, title: "Built-in editor", desc: "Refine scenes with auto-save and version history." },
    { icon: Download, title: "Industry-format PDF", desc: "Courier 12pt, scene headings, dialogue indents." },
    { icon: Zap, title: "MTN MoMo payments", desc: "Upgrade with mobile money in a few taps." },
  ];

  const reviews = [
    { name: "Ama K.", role: "Indie filmmaker", quote: "I went from a rough idea to a clean first draft in one evening. The extend tool saved days.", initials: "AK" },
    { name: "David O.", role: "YouTube creator", quote: "It keeps my scenes structured, fast, and surprisingly cinematic without fighting the editor.", initials: "DO" },
    { name: "Lina T.", role: "Film student", quote: "The word-count targets and export flow make this feel built for real submission deadlines.", initials: "LT" },
  ];

  const stats = [
    { value: "6k–50k+", label: "word targets by plan" },
    { value: "PDF-ready", label: "screenplay export format" },
    { value: "5–Unlimited", label: "daily generations" },
  ];

  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div className="absolute inset-0 bg-gradient-hero opacity-10" aria-hidden />
        <div className="absolute top-20 -right-20 w-96 h-96 rounded-full bg-primary/20 blur-3xl animate-float" aria-hidden />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-accent/20 blur-3xl animate-float" aria-hidden />

        <div className="container relative py-12 md:py-20">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
            <div className="animate-fade-in">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/30 border border-secondary/40 text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4 text-primary" />
              Powered by Lovable AI
              </span>
              <h1 className="font-display text-5xl md:text-7xl font-black text-balance leading-[1.05] mb-6">
                Turn ideas into <span className="bg-gradient-hero bg-clip-text text-transparent">cinematic scripts</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 text-balance max-w-2xl">
                Build story concepts, choose a target word count, generate a full draft, then keep extending until your screenplay reaches the shape you want.
              </p>
              <div className="flex flex-wrap items-center gap-3 mb-8">
                <Button size="lg" asChild className="bg-gradient-hero text-white border-0 hover:opacity-90 shadow-playful h-12 px-8 text-base">
                  <Link to={user ? "/dashboard/new" : "/auth"}>
                    <Wand2 className="mr-2 h-5 w-5" /> Generate a script
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base">
                  <Link to="/pricing"><Crown className="mr-2 h-5 w-5" /> See pricing</Link>
                </Button>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {stats.map((stat) => (
                  <Card key={stat.label} className="p-4 bg-card/80 border-border/60 shadow-soft">
                    <p className="font-display text-2xl font-black">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </Card>
                ))}
              </div>
            </div>

            <div className="animate-fade-in lg:pl-6" style={{ animationDelay: "120ms" }}>
              <div className="overflow-hidden rounded-[2rem] border border-border/60 shadow-playful bg-card/70 backdrop-blur-sm">
                <AspectRatio ratio={4 / 3}>
                  <img src={heroImage} alt="Screenwriter working on a screenplay draft at a cinematic desk setup" className="h-full w-full object-cover" width={1536} height={1024} />
                </AspectRatio>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <Card className="p-4 bg-gradient-card border-border/60">
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium"><CheckCircle2 className="h-4 w-4 text-success" /> Built-in word targets</div>
                  <p className="text-sm text-muted-foreground">Free up to 6,000 words, Pro up to 30,000, Premium 50,000+.</p>
                </Card>
                <Card className="p-4 bg-gradient-card border-border/60">
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium"><Stars className="h-4 w-4 text-primary" /> Extend after generation</div>
                  <p className="text-sm text-muted-foreground">Keep growing a draft until it gets close to your target without restarting.</p>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features grid — webtoon-style cards */}
      <section className="container py-16">
        <h2 className="font-display text-4xl md:text-5xl font-bold text-center mb-12">
          Everything you need to <span className="bg-gradient-sunset bg-clip-text text-transparent">tell stories</span>
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <Card
              key={f.title}
              className="p-6 bg-gradient-card border-border/60 shadow-soft hover:shadow-playful hover:-translate-y-1 transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-hero text-white mb-4 shadow-playful">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="container py-8 md:py-16">
        <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-8 items-center">
          <Card className="overflow-hidden border-border/60 shadow-soft bg-card/70">
            <AspectRatio ratio={16 / 10}>
              <img src={pagesImage} alt="Marked-up screenplay pages and a digital script preview on a tablet" className="h-full w-full object-cover" loading="lazy" width={1536} height={1024} />
            </AspectRatio>
          </Card>
          <div>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/30 border border-secondary/40 text-sm font-medium mb-5">
              <FileText className="h-4 w-4 text-primary" /> More than a one-click generator
            </span>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-5 text-balance">Shape the draft, not just the prompt.</h2>
            <p className="text-muted-foreground text-lg mb-6 max-w-2xl">ScriptToon helps you move from premise to polished screenplay with target-length planning, iterative extension, version history, editing controls, and clean PDF export.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                "Pick a target word count before generation",
                "Track progress toward your target in the editor",
                "Extend scene-by-scene without losing continuity",
                "Export readable screenplay PDFs for pitching",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/70 p-4">
                  <CheckCircle2 className="h-5 w-5 text-success mt-0.5 shrink-0" />
                  <p className="text-sm">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container py-8 md:py-16">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-4xl md:text-5xl font-bold">Writers are already using it</h2>
            <p className="text-muted-foreground mt-2">From film school exercises to creator-led pilots and pitch decks.</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {reviews.map((review) => (
            <Card key={review.name} className="p-6 bg-gradient-card border-border/60 shadow-soft">
              <Quote className="h-8 w-8 text-primary/70 mb-4" />
              <p className="text-sm leading-6 mb-6">“{review.quote}”</p>
              <Separator className="mb-4" />
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">{review.initials}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-sm">{review.name}</p>
                  <p className="text-xs text-muted-foreground">{review.role}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-hero p-10 md:p-16 text-center text-white shadow-playful">
          <FileText className="absolute top-6 right-6 h-24 w-24 opacity-10" />
          <h2 className="font-display text-4xl md:text-5xl font-black mb-4">Your next blockbuster starts here.</h2>
          <p className="text-lg opacity-90 mb-6 max-w-xl mx-auto">Free forever for short scripts. Upgrade with MTN MoMo to unlock pro features.</p>
          <Button size="lg" asChild variant="secondary" className="h-12 px-8 text-base">
            <Link to={user ? "/dashboard" : "/auth"}>Start writing — it's free</Link>
          </Button>
        </div>
      </section>
    </Layout>
  );
};

export default Index;
