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
}

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
- Aim for 8-15 scenes for a short, 20-40 for a long-form, with full dialogue.`;

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

    // Subscription tier — longer scripts for paid users
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: sub } = await admin.from("subscriptions").select("tier").eq("user_id", userId).maybeSingle();
    const tier = (sub?.tier as string) ?? "free";
    const lengthHint = tier === "free" ? "Short film length (8-12 scenes, ~10 pages)." :
                       tier === "pro" ? "Half-hour length (20-30 scenes, ~25-30 pages)." :
                       "Feature-length (40+ scenes, rich subtext and subplots).";

    const userPrompt = `Create a screenplay.
Genre: ${body.genre || "unspecified"}
Tone: ${body.tone || "unspecified"}
Main characters: ${body.characters || "create as needed"}
Plot idea: ${plot}

Length target: ${lengthHint}

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

    return new Response(JSON.stringify({ id: inserted.id, title: inserted.title }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
