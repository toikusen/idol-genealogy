-- Migration 120: Telegram alerts for new pending proposals and every audit_log row.
-- Posts to the notify-telegram Edge Function via pg_net, signed with the Vault secret
-- 'telegram_webhook_secret' (must equal the function's TELEGRAM_WEBHOOK_SECRET).
-- No Vault secret = silently off, so local/dev databases never hit the prod function.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

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
    body    := jsonb_build_object('type', TG_OP, 'table', TG_TABLE_NAME, 'record', to_jsonb(NEW))
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- a notification must never roll back the edit or proposal that caused it
  RAISE WARNING 'notify_telegram failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_telegram() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS proposals_notify_telegram ON proposals;
CREATE TRIGGER proposals_notify_telegram
  AFTER INSERT ON proposals
  FOR EACH ROW WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION notify_telegram();

DROP TRIGGER IF EXISTS audit_log_notify_telegram ON audit_log;
CREATE TRIGGER audit_log_notify_telegram
  AFTER INSERT ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION notify_telegram();
