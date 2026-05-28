-- Add audit trigger to venues table
DO $$ BEGIN
  CREATE TRIGGER venues_audit
    AFTER INSERT OR UPDATE OR DELETE ON venues
    FOR EACH ROW EXECUTE FUNCTION log_changes();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
