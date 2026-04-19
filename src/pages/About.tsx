import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Film, Sparkles, Heart, Globe } from "lucide-react";

const About = () => (
  <Layout>
    <div className="container py-12 md:py-20 max-w-4xl">
      <div className="text-center mb-12">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/30 border border-secondary/40 text-sm font-medium mb-4">
          <Heart className="h-4 w-4 text-primary" /> Built for storytellers
        </span>
        <h1 className="font-display text-5xl md:text-6xl font-black mb-4">
          We believe everyone has a <span className="bg-gradient-hero bg-clip-text text-transparent">story to tell</span>
        </h1>
        <p className="text-lg text-muted-foreground text-balance">
          ScriptToon makes professional screenwriting accessible — no Final Draft, no friction. Just your idea, an AI co-writer, and a clean PDF in industry format.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5 mb-12">
        {[
          { icon: Sparkles, title: "AI as collaborator", desc: "Models trained for narrative structure — not just text completion." },
          { icon: Film, title: "Industry format", desc: "Courier 12pt, scene headings, dialogue indents. Ready to pitch." },
          { icon: Globe, title: "Built for Africa & beyond", desc: "MTN MoMo payments. Mobile-first. Works on any device." },
        ].map((c) => (
          <Card key={c.title} className="p-6 bg-gradient-card border-border/60">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-hero text-white mb-3">
              <c.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display text-xl font-bold mb-2">{c.title}</h3>
            <p className="text-sm text-muted-foreground">{c.desc}</p>
          </Card>
        ))}
      </div>

      <Card className="p-8 bg-gradient-hero text-white border-0 shadow-playful">
        <h2 className="font-display text-3xl font-bold mb-3">Our mission</h2>
        <p className="opacity-90 leading-relaxed">
          To remove every barrier between a storyteller and their first finished screenplay. Whether you're a film student in Kampala, a YouTuber in Lagos, or a TV writer in LA — your next script is one prompt away.
        </p>
      </Card>
    </div>
  </Layout>
);

export default About;
