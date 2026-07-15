-- Migration 083: Add audit trigger to companies table
-- companies was the only editable entity table without a log_changes() trigger,
-- so company create/edit/delete never appeared in the admin audit log.
DO $$ BEGIN
  CREATE TRIGGER companies_audit
    AFTER INSERT OR UPDATE OR DELETE ON companies
    FOR EACH ROW EXECUTE FUNCTION log_changes();
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
