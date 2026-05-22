import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  user_ids: string[];
  notification: {
    title: string;
    body: string;
    icon?: string;
    data?: { onActionClick?: { default?: { operation: string; url: string } } };
  };
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth_key: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string,
): Promise<void> {
  const webpush = await import("npm:web-push@3.6.7");
  webpush.setVapidDetails(subject, vapidPublicKey, vapidPrivateKey);
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
    },
    payload,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const expectedAuth = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`;
  if (authHeader !== expectedAuth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;

  const body = await req.json() as PushPayload;

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("user_id", body.user_ids);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = JSON.stringify({ notification: body.notification });
  const expiredEndpoints: string[] = [];

  await Promise.allSettled(
    (subs ?? []).map(async (sub) => {
      try {
        await sendWebPush(sub, payload, vapidPublicKey, vapidPrivateKey, vapidSubject);
      } catch (err: any) {
        if (err?.statusCode === 410) expiredEndpoints.push(sub.endpoint);
      }
    }),
  );

  if (expiredEndpoints.length) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", expiredEndpoints);
  }

  return new Response(
    JSON.stringify({ sent: (subs?.length ?? 0) - expiredEndpoints.length, cleaned: expiredEndpoints.length }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
