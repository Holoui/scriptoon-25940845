import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  genre?: string;
  tone?: string;
  characters?: string;
  plot_idea?: string;
  format?: "movie" | "series";
  acts?: number;
  episodes?: number;
  pages?: number;
  words?: number;
}

type Tier = "free" | "pro" | "premium";

const LIMITS: Record<Tier, { pages: number; acts: number; episodes: number; words: number; dailyGenerations: number; allowSeries: boolean }> = {
  free:    { pages: 12,  acts: 2,  episodes: 2,  words: 6000,  dailyGenerations: 5,                  allowSeries: false },
  pro:     { pages: 60,  acts: 10, episodes: 6,  words: 30000, dailyGenerations: 20,                 allowSeries: true  },
  premium: { pages: 150, acts: 50, episodes: 12, words: 50000, dailyGenerations: Number.MAX_SAFE_INTEGER, allowSeries: true  },
};

const SYSTEM = `You are a professional screenwriter. Output valid JSON only, no prose, no markdown.
Schema:
{
  "title": "string (3-8 words, evocative)",
  "logline": "string (1-2 sentences)",
  "synopsis": "string (3-5 paragraphs)",
  "screenplay": "string (full screenplay in industry format)"
}

Screenplay format rules:
- Use scene headings: INT. or EXT. followed by LOCATION - DAY/NIGHT
- Action lines are present-tense, concise, in normal case
- Character names appear UPPERCASE on their own line above dialogue
- Dialogue follows the character name on the next line
- Parentheticals in (lowercase) on their own line between cue and dialogue
- Transitions like CUT TO: or FADE OUT. on their own line, all caps
- Start with "FADE IN:" and end with "FADE OUT."
- For series, separate each episode with a heading like:
  "=== EPISODE 1: <TITLE> ===" then "FADE IN:" then scenes, then "END OF EPISODE 1".`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userRes.user.id;

    const body: Body = await req.json().catch(() => ({}));
    const plot = (body.plot_idea ?? "").trim();
    if (!plot) {
      return new Response(JSON.stringify({ error: "plot_idea is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: sub } = await admin.from("subscriptions").select("tier").eq("user_id", userId).maybeSingle();
    const tier: Tier = ((sub?.tier as Tier) ?? "free");
    const limits = LIMITS[tier];

    // Daily generation rate-limit (UTC day window)
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count: usedToday } = await admin
      .from("script_generations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dayStart.toISOString());
    if ((usedToday ?? 0) >= limits.dailyGenerations) {
      return new Response(JSON.stringify({
        error: `Daily limit reached. Your ${tier} plan allows ${limits.dailyGenerations} script(s) per day. Upgrade for more.`,
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Clamp inputs to plan limits
    const format: "movie" | "series" = body.format === "series" && limits.allowSeries ? "series" : "movie";
    const acts = Math.max(1, Math.min(Number(body.acts) || 3, limits.acts));
    const words = Math.max(500, Math.min(Number(body.words) || Math.min(6000, limits.words), limits.words));
    const pages = Math.max(3, Math.min(Number(body.pages) || Math.round(words / 230), limits.pages));
    const episodes = format === "series" ? Math.max(1, Math.min(Number(body.episodes) || 2, limits.episodes)) : 1;

    const qualityNote = tier === "premium"
      ? "Use rich, layered character development, vivid subtext, distinct character voices, and cinematic scene craft."
      : tier === "pro"
      ? "Maintain professional pacing and clear character arcs."
      : "Keep it concise and clear — this is a free-tier sample.";

    const lengthHint = format === "series"
      ? `A film series with ${episodes} episode(s). Total target: ~${words} words across the whole series (~${pages} screenplay pages). Each episode roughly ${Math.max(3, Math.round(pages / episodes))} pages, structured into ${acts} act(s).`
      : `A full movie screenplay targeting approximately ${words} words (~${pages} pages), structured into ${acts} act(s)/chapter(s). Aim close to the target word count — do not stop short.`;

    const userPrompt = `Create a screenplay.
Genre: ${body.genre || "unspecified"}
Tone: ${body.tone || "unspecified"}
Main characters: ${body.characters || "create as needed"}
Plot idea: ${plot}

Format: ${format}
${lengthHint}
${qualityNote}

Return ONLY the JSON object as specified.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit hit. Please wait a moment and try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Lovable Cloud → Workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI error", aiRes.status, txt);
      return new Response(JSON.stringify({ error: "AI request failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const title = (parsed.title || "Untitled").toString().slice(0, 200);
    const logline = (parsed.logline || "").toString();
    const synopsis = (parsed.synopsis || "").toString();
    const content = (parsed.screenplay || "").toString();

    const { data: inserted, error: insErr } = await admin.from("scripts").insert({
      user_id: userId,
      title, logline, synopsis, content,
      genre: body.genre ?? null,
      tone: body.tone ?? null,
      characters: body.characters ?? null,
      plot_idea: plot,
      status: "generated",
    }).select("id, title").single();

    if (insErr) {
      console.error(insErr);
      return new Response(JSON.stringify({ error: "Could not save script" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Log the generation for daily-limit tracking (best-effort)
    await admin.from("script_generations").insert({ user_id: userId });

    return new Response(JSON.stringify({ id: inserted.id, title: inserted.title }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
