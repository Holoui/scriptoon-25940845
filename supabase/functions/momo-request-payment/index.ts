import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Initiates an MTN MoMo Request-To-Pay.
 * If MoMo credentials are configured, calls the live API.
 * Otherwise records a pending payment so the dialog flow still works in dev.
 */
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

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const tier = body.tier as "pro" | "premium";
    const amount = Number(body.amount);
    const currency = String(body.currency ?? "EUR");

    if (!phone || !/^[0-9]{9,15}$/.test(phone)) {
      return new Response(JSON.stringify({ error: "Invalid phone" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!["pro", "premium"].includes(tier)) {
      return new Response(JSON.stringify({ error: "Invalid tier" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const reference = crypto.randomUUID();
    const admin = createClient(SUPABASE_URL, SERVICE);

    // Record pending payment (so admin dashboard sees it immediately)
    await admin.from("payments").insert({
      user_id: userRes.user.id,
      tier,
      amount,
      currency,
      provider: "mtn_momo",
      phone_number: phone,
      external_reference: reference,
      status: "pending",
    });

    const SUB_KEY = Deno.env.get("MOMO_SUBSCRIPTION_KEY");
    const API_USER = Deno.env.get("MOMO_API_USER");
    const API_KEY = Deno.env.get("MOMO_API_KEY");
    const TARGET_ENV = Deno.env.get("MOMO_TARGET_ENV") ?? "sandbox";
    const CALLBACK = Deno.env.get("MOMO_CALLBACK_URL");

    // If credentials present, call MTN MoMo Collection API
    if (SUB_KEY && API_USER && API_KEY) {
      try {
        const tokenRes = await fetch(`https://${TARGET_ENV === "production" ? "momodeveloper.mtn.com" : "sandbox.momodeveloper.mtn.com"}/collection/token/`, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${btoa(`${API_USER}:${API_KEY}`)}`,
            "Ocp-Apim-Subscription-Key": SUB_KEY,
          },
        });
        if (!tokenRes.ok) throw new Error(`MoMo token ${tokenRes.status}`);
        const { access_token } = await tokenRes.json();

        const payRes = await fetch(`https://${TARGET_ENV === "production" ? "momodeveloper.mtn.com" : "sandbox.momodeveloper.mtn.com"}/collection/v1_0/requesttopay`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${access_token}`,
            "X-Reference-Id": reference,
            "X-Target-Environment": TARGET_ENV,
            "Ocp-Apim-Subscription-Key": SUB_KEY,
            "Content-Type": "application/json",
            ...(CALLBACK ? { "X-Callback-Url": CALLBACK } : {}),
          },
          body: JSON.stringify({
            amount: amount.toFixed(2),
            currency,
            externalId: reference,
            payer: { partyIdType: "MSISDN", partyId: phone },
            payerMessage: `ScriptToon ${tier} subscription`,
            payeeNote: `${tier} plan`,
          }),
        });

        if (!payRes.ok && payRes.status !== 202) {
          const txt = await payRes.text();
          console.error("MoMo pay error", payRes.status, txt);
          await admin.from("payments").update({ status: "failed", raw_response: { error: txt } }).eq("external_reference", reference);
          return new Response(JSON.stringify({ error: "MTN MoMo rejected the request" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } catch (e) {
        console.error("MoMo flow error", e);
        await admin.from("payments").update({ status: "failed", raw_response: { error: String(e) } }).eq("external_reference", reference);
        return new Response(JSON.stringify({ error: "Could not reach MTN MoMo" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      console.log("MoMo creds not configured — payment recorded as pending only");
    }

    return new Response(JSON.stringify({ reference, status: "pending" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
