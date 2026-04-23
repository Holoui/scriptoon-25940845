const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  genre?: string;
  tone?: string;
  plot_idea?: string;
}

const SYSTEM = `You are an A-list screenwriter writing a SHORT TEASER sample (free landing-page demo). Output valid JSON only, no prose, no markdown.
Schema:
{
  "title": "string (3-6 words, evocative)",
  "logline": "string (1-2 sentences with hook + want + obstacle + stakes)",
  "screenplay": "string (a SHORT screenplay opening, ~2-3 pages / ~600-900 words, in strict industry format)"
}

Rules:
- Open with a striking visual hook in the first paragraph. No throat-clearing.
- Distinct character voices, subtext, escalation, one memorable beat.
- PG-13 / broadcast-safe. No explicit sexual content or extreme graphic violence.
- Strict screenplay format:
  - Scene headings: INT. or EXT. LOCATION - DAY/NIGHT
  - Action lines: present tense, concise
  - Character cues: UPPERCASE on their own line above dialogue
  - Dialogue: under the cue
  - Parentheticals: (lowercase) sparingly
  - Begin with "FADE IN:" and end the teaser with "TO BE CONTINUED..."`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body: Body = await req.json().catch(() => ({}));
    const plot = (body.plot_idea ?? "").trim();
    if (!plot) {
      return new Response(JSON.stringify({ error: "Tell us your story idea first." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (plot.length > 600) {
      return new Response(JSON.stringify({ error: "Idea is too long for the free demo. Keep it under 600 characters." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userPrompt = `Write a short teaser screenplay opening (~2-3 pages).
Genre: ${body.genre || "unspecified"}
Tone: ${body.tone || "unspecified"}
Plot idea: ${plot}

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
      return new Response(JSON.stringify({ error: "Lots of writers right now — please try again in a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({
        error: "AI credits are exhausted on this workspace. Add credits in Lovable Cloud → Workspace settings to re-enable the free demo.",
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const title = (parsed.title || "Untitled Teaser").toString().slice(0, 120);
    const logline = (parsed.logline || "").toString();
    const screenplay = (parsed.screenplay || "").toString();

    return new Response(JSON.stringify({ title, logline, screenplay }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});