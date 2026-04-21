import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Tier = "free" | "pro" | "premium";

const LIMITS: Record<Tier, { words: number; pages: number; allowExtend: boolean; dailyExtends: number }> = {
  free:    { words: 6000,   pages: 12,  allowExtend: true, dailyExtends: 1                       },
  pro:     { words: 30000,  pages: 60,  allowExtend: true, dailyExtends: Number.MAX_SAFE_INTEGER },
  premium: { words: 115000, pages: 500, allowExtend: true, dailyExtends: Number.MAX_SAFE_INTEGER },
};

const WORDS_PER_PAGE = 230;

const SYSTEM = `You are a professional screenwriter continuing an in-progress screenplay.
Output ONLY the new screenplay text to APPEND — no JSON, no markdown, no preface, no recap.
Strict rules:
- Continue seamlessly from the last line of the existing script. Do NOT repeat or rephrase prior content.
- Do NOT include a "FADE IN:" again. Do NOT write "FADE OUT." unless the story is truly ending.
- Maintain the same tone, characters, voice, formatting and tense already established.
- Use industry screenplay format: scene headings (INT./EXT. LOCATION - DAY/NIGHT), action lines, UPPERCASE character cues, dialogue, parentheticals in (lowercase), transitions in ALL CAPS.
- Add fresh scenes that move the plot forward toward resolution.
- Aim for approximately the requested word count of new material. Do not stop early.`;

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

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

    const body = await req.json().catch(() => ({}));
    const scriptId = String(body.script_id ?? "").trim();
    const targetWords = Math.max(500, Math.min(Number(body.target_words) || 0, 50000));
    if (!scriptId) {
      return new Response(JSON.stringify({ error: "script_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: sub } = await admin.from("subscriptions").select("tier").eq("user_id", userId).maybeSingle();
    const tier: Tier = ((sub?.tier as Tier) ?? "free");
    const limits = LIMITS[tier];

    // Free tier — enforce rolling 24h cooldown of 1 Extend per day
    if (limits.dailyExtends !== Number.MAX_SAFE_INTEGER) {
      const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await admin
        .from("usage_events")
        .select("created_at")
        .eq("user_id", userId)
        .eq("kind", "free_extend")
        .gte("created_at", windowStart)
        .order("created_at", { ascending: true });
      const used = recent?.length ?? 0;
      if (used >= limits.dailyExtends) {
        const oldest = recent?.[0]?.created_at ?? new Date().toISOString();
        const retryAt = new Date(new Date(oldest).getTime() + 24 * 60 * 60 * 1000).toISOString();
        return new Response(JSON.stringify({
          error: `Free plan allows ${limits.dailyExtends} Extend per 24 hours. Try again later or upgrade for unlimited.`,
          rate_limited: true,
          retry_at: retryAt,
          used,
          limit: limits.dailyExtends,
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { data: script, error: sErr } = await admin
      .from("scripts")
      .select("id, user_id, title, content, genre, tone, characters, plot_idea, synopsis, target_words")
      .eq("id", scriptId)
      .maybeSingle();
    if (sErr || !script) {
      return new Response(JSON.stringify({ error: "Script not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (script.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const planMaxWords = limits.words;
    const planMaxPages = limits.pages;

    const effectiveTarget = Math.min(targetWords || script.target_words || planMaxWords, planMaxWords);
    const currentWords = countWords(script.content || "");
    const currentPages = Math.round((currentWords / WORDS_PER_PAGE) * 10) / 10;

    // Plan cap reached — refuse to extend further and notify the user
    if (currentWords >= planMaxWords - 50 || currentPages >= planMaxPages) {
      return new Response(JSON.stringify({
        capped: true,
        done: true,
        plan_capped: true,
        words: currentWords,
        pages: currentPages,
        plan_max_words: planMaxWords,
        plan_max_pages: planMaxPages,
        target: effectiveTarget,
        added: 0,
        content: script.content,
        message: `You've hit your ${tier} plan ceiling of ${planMaxWords.toLocaleString()} words (~${planMaxPages} pages). ${tier === "premium" ? "Start a new script to keep writing." : "Upgrade to extend further."}`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const remaining = effectiveTarget - currentWords;

    if (remaining <= 50) {
      return new Response(JSON.stringify({
        message: "Already at or above target",
        words: currentWords,
        target: effectiveTarget,
        added: 0,
        done: true,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Don't let one chunk push us past the plan cap
    const headroom = Math.max(0, planMaxWords - currentWords - 100);
    const chunkTarget = Math.min(remaining, 3500, headroom);

    if (chunkTarget < 200) {
      return new Response(JSON.stringify({
        capped: true,
        done: true,
        plan_capped: true,
        words: currentWords,
        pages: currentPages,
        plan_max_words: planMaxWords,
        plan_max_pages: planMaxPages,
        target: effectiveTarget,
        added: 0,
        content: script.content,
        message: `You're within reach of your ${tier} plan ceiling (~${planMaxWords.toLocaleString()} words). ${tier === "premium" ? "Start a new script to keep writing." : "Upgrade to extend further."}`,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use last ~2500 words as context tail to keep continuity within model limits
    const tailWords = script.content.split(/\s+/);
    const tailStart = Math.max(0, tailWords.length - 2500);
    const tail = tailWords.slice(tailStart).join(" ");

    const userPrompt = `TITLE: ${script.title}
GENRE: ${script.genre ?? "unspecified"}
TONE: ${script.tone ?? "unspecified"}
CHARACTERS: ${script.characters ?? "as established"}
PLOT IDEA: ${script.plot_idea ?? "as established"}
SYNOPSIS: ${script.synopsis ?? "as established"}

CURRENT WORD COUNT: ${currentWords}
TARGET WORD COUNT: ${effectiveTarget}
ADD APPROXIMATELY: ${chunkTarget} new words

EXISTING SCRIPT (last portion — continue seamlessly from the final line, do not repeat):
"""
${tail}
"""

Now write ONLY the new screenplay continuation to append. No preface, no recap, no JSON, no markdown — just the raw screenplay text.`;

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
    let extension = (aiJson.choices?.[0]?.message?.content ?? "").toString().trim();

    // Strip accidental code fences or JSON wrappers
    extension = extension.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/g, "").trim();

    if (!extension) {
      return new Response(JSON.stringify({ error: "AI returned empty extension" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let newContent = (script.content.endsWith("\n") ? script.content : script.content + "\n\n") + extension;
    let newWords = countWords(newContent);

    // Hard-trim if AI overshot the plan cap
    let trimmed = false;
    if (newWords > planMaxWords) {
      const allWords = newContent.split(/\s+/).filter(Boolean);
      newContent = allWords.slice(0, planMaxWords).join(" ");
      newWords = countWords(newContent);
      trimmed = true;
    }

    const newPages = Math.round((newWords / WORDS_PER_PAGE) * 10) / 10;

    const updates: Record<string, unknown> = { content: newContent };
    if (effectiveTarget && script.target_words !== effectiveTarget) {
      updates.target_words = effectiveTarget;
    }

    const { error: updErr } = await admin.from("scripts").update(updates).eq("id", scriptId);
    if (updErr) {
      console.error(updErr);
      return new Response(JSON.stringify({ error: "Couldn't save extension" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const planCapped = trimmed || newWords >= planMaxWords - 50 || newPages >= planMaxPages;
    const targetReached = newWords >= effectiveTarget - 50;

    return new Response(JSON.stringify({
      content: newContent,
      words: newWords,
      pages: newPages,
      target: effectiveTarget,
      added: newWords - currentWords,
      done: targetReached || planCapped,
      capped: planCapped,
      plan_capped: planCapped,
      plan_max_words: planMaxWords,
      plan_max_pages: planMaxPages,
      message: planCapped
        ? `You've reached your ${tier} plan ceiling of ~${planMaxWords.toLocaleString()} words. ${tier === "premium" ? "Start a new script to keep writing." : "Upgrade to extend further."}`
        : undefined,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
