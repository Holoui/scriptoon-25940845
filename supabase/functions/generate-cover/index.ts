import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Tier = "free" | "pro" | "premium";

const COVER_LIMITS: Record<Tier, { allowed: boolean; daily: number }> = {
  free:    { allowed: false, daily: 0 },
  pro:     { allowed: true,  daily: 3 },
  premium: { allowed: true,  daily: Number.MAX_SAFE_INTEGER },
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

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
    const styleHint = String(body.style ?? "").trim().slice(0, 200);
    if (!scriptId) {
      return new Response(JSON.stringify({ error: "script_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Tier gate
    const { data: sub } = await admin.from("subscriptions").select("tier").eq("user_id", userId).maybeSingle();
    const tier: Tier = ((sub?.tier as Tier) ?? "free");
    const limits = COVER_LIMITS[tier];
    if (!limits.allowed) {
      return new Response(JSON.stringify({
        error: "Movie covers are a Pro & Premium feature. Upgrade to generate posters for your scripts.",
        upgrade_required: true,
      }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Rolling 24h limit (skip for premium)
    if (limits.daily !== Number.MAX_SAFE_INTEGER) {
      const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await admin
        .from("usage_events")
        .select("created_at")
        .eq("user_id", userId)
        .eq("kind", "cover_generation")
        .gte("created_at", windowStart)
        .order("created_at", { ascending: true });
      const used = recent?.length ?? 0;
      if (used >= limits.daily) {
        const oldest = recent?.[0]?.created_at ?? new Date().toISOString();
        const retryAt = new Date(new Date(oldest).getTime() + 24 * 60 * 60 * 1000).toISOString();
        return new Response(JSON.stringify({
          error: `You've used all ${limits.daily} cover generations for your ${tier} plan in the last 24 hours. Try again later or upgrade to Premium for unlimited covers.`,
          rate_limited: true,
          retry_at: retryAt,
          used,
          limit: limits.daily,
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fetch script for context
    const { data: script, error: sErr } = await admin
      .from("scripts")
      .select("id, user_id, title, logline, synopsis, genre, tone, characters")
      .eq("id", scriptId)
      .maybeSingle();
    if (sErr || !script) {
      return new Response(JSON.stringify({ error: "Script not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (script.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const prompt = `Design a striking, professional theatrical movie poster for the film titled "${script.title}".
Genre: ${script.genre ?? "drama"}.
Tone: ${script.tone ?? "cinematic"}.
Logline: ${script.logline ?? "An untold story."}
Key characters: ${script.characters ?? "ensemble cast"}.
${styleHint ? `Art direction note: ${styleHint}.` : ""}

Requirements:
- Vertical 2:3 movie poster composition with strong focal hero imagery
- Cinematic lighting, dramatic mood, painterly photo-real aesthetic
- Bold readable title "${script.title}" rendered as clean modern movie-poster typography near the bottom
- A small tagline line above the title that reflects the logline
- Negative space and clean layout — no clutter, no watermarks, no logos, no extra text besides the title and tagline
- Production-quality finish suitable for marketing to producers`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
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
      console.error("AI cover error", aiRes.status, txt);
      return new Response(JSON.stringify({ error: "AI request failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiJson = await aiRes.json();
    const dataUrl: string | undefined = aiJson.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      console.error("No image in AI response", JSON.stringify(aiJson).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI did not return an image" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Invalid image payload" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const mime = match[1];
    const ext = mime.split("/")[1].split("+")[0];
    const bytes = b64ToBytes(match[2]);

    const path = `${userId}/${scriptId}-${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage.from("script-covers").upload(path, bytes, {
      contentType: mime,
      upsert: true,
    });
    if (upErr) {
      console.error("Upload error", upErr);
      return new Response(JSON.stringify({ error: "Couldn't save cover" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: pub } = admin.storage.from("script-covers").getPublicUrl(path);
    const coverUrl = pub.publicUrl;

    await admin.from("scripts").update({ cover_url: coverUrl }).eq("id", scriptId);
    await admin.from("usage_events").insert({ user_id: userId, kind: "cover_generation" });

    return new Response(JSON.stringify({ cover_url: coverUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});