-- Migration 121: give notify-telegram 15s instead of pg_net's 5s default; name lookups
-- plus sendPhoto on a cold start overran it (the request is async, writes never wait).
CREATE OR REPLACE FUNCTION notify_telegram()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'telegram_webhook_secret';
  IF v_secret IS NULL THEN RETURN NULL; END IF;

  PERFORM net.http_post(
    url     := 'https://ziiagdrrytyrmzoeegjk.supabase.co/functions/v1/notify-telegram',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body    := jsonb_build_object('type', TG_OP, 'table', TG_TABLE_NAME, 'record', to_jsonb(NEW)),
    timeout_milliseconds := 15000
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- a notification must never roll back the edit or proposal that caused it
  RAISE WARNING 'notify_telegram failed: %', SQLERRM;
  RETURN NULL;
END;
$$;
