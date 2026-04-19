import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Zap, FileText, Crown, Wand2, Download, PenLine } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { user } = useAuth();

  const features = [
    { icon: Wand2, title: "AI screenplay engine", desc: "Logline, synopsis, full script — generated in seconds." },
    { icon: PenLine, title: "Built-in editor", desc: "Refine scenes with auto-save and version history." },
    { icon: Download, title: "Industry-format PDF", desc: "Courier 12pt, scene headings, dialogue indents." },
    { icon: Zap, title: "MTN MoMo payments", desc: "Upgrade with mobile money in a few taps." },
  ];

  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero opacity-10" aria-hidden />
        <div className="absolute top-20 -right-20 w-96 h-96 rounded-full bg-primary/20 blur-3xl animate-float" aria-hidden />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-accent/20 blur-3xl animate-float" aria-hidden />

        <div className="container relative py-16 md:py-28">
          <div className="max-w-3xl mx-auto text-center animate-fade-in">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/30 border border-secondary/40 text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4 text-primary" />
              Powered by Lovable AI
            </span>
            <h1 className="font-display text-5xl md:text-7xl font-black text-balance leading-[1.05] mb-6">
              Turn ideas into{" "}
              <span className="bg-gradient-hero bg-clip-text text-transparent">cinematic scripts</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 text-balance">
              Describe a vibe, a hero, a twist — ScriptToon writes the full screenplay in industry format.
              Edit, export, and pitch.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild className="bg-gradient-hero text-white border-0 hover:opacity-90 shadow-playful h-12 px-8 text-base">
                <Link to={user ? "/dashboard/new" : "/auth"}>
                  <Wand2 className="mr-2 h-5 w-5" /> Generate a script
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base">
                <Link to="/pricing"><Crown className="mr-2 h-5 w-5" /> See pricing</Link>
              </Button>
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
