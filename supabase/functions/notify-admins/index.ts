// notify-admins: writes in-app notifications to all admin users
// AND attempts to send a transactional email if email infra is set up.
// If email infra is missing, in-app notifications still work.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  kind: 'new_payment' | 'new_chat_thread';
  userEmail?: string;
  details: Record<string, any>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json()) as Body;
    if (!body?.kind || !body?.details) {
      return new Response(JSON.stringify({ error: 'invalid payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) Discover all admin user_ids
    const { data: adminRoles, error: rolesErr } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (rolesErr) throw rolesErr;
    const adminIds: string[] = (adminRoles ?? []).map((r: any) => r.user_id);

    if (adminIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'no admins' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Build notification copy
    let title = '';
    let bodyText = '';
    if (body.kind === 'new_payment') {
      const d = body.details;
      title = `💰 New payment from ${body.userEmail ?? 'a user'}`;
      bodyText = `${d.tier?.toString().toUpperCase()} · ${d.currency} ${Number(d.amount).toFixed(2)} · MoMo ${d.phone} · ref ${d.reference}`;
    } else {
      const d = body.details;
      title = `💬 New support chat from ${body.userEmail ?? 'a user'}`;
      bodyText = `${d.subject}${d.preview ? `\n\n"${d.preview}"` : ''}`;
    }

    // 3) Insert in-app notifications for every admin
    const rows = adminIds.map((uid) => ({
      user_id: uid,
      kind: `admin_${body.kind}`,
      title,
      body: bodyText,
    }));
    const { error: insertErr } = await supabase.from('notifications').insert(rows);
    if (insertErr) console.error('notif insert err', insertErr);

    // 4) Try sending transactional email (best-effort; fails silently if infra missing)
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('email')
      .in('id', adminIds);

    const adminEmails: string[] = (adminProfiles ?? [])
      .map((p: any) => p.email)
      .filter((e: string | null) => !!e);

    let emailResults: Array<{ to: string; ok: boolean; error?: string }> = [];
    for (const email of adminEmails) {
      try {
        const { error: emailErr } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: body.kind === 'new_payment' ? 'admin-new-payment' : 'admin-new-chat',
            recipientEmail: email,
            idempotencyKey: `${body.kind}-${JSON.stringify(body.details).slice(0, 40)}-${email}-${Date.now()}`,
            templateData: { ...body.details, userEmail: body.userEmail },
          },
        });
        emailResults.push({ to: email, ok: !emailErr, error: emailErr?.message });
      } catch (e) {
        emailResults.push({ to: email, ok: false, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, notified: adminIds.length, emails: emailResults }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('notify-admins error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
