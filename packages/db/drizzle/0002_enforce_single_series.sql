-- Enforce that each upload belongs to at most one series.
-- A partial unique index isn't possible here (can't filter on a joined table),
-- so we use a trigger that fires before each INSERT on upload_list_entry.

CREATE OR REPLACE FUNCTION check_upload_single_series()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT type FROM upload_list WHERE id = NEW.upload_list_id) = 'SERIES' THEN
    IF EXISTS (
      SELECT 1
      FROM upload_list_entry ule
      JOIN upload_list ul ON ul.id = ule.upload_list_id
      WHERE ule.upload_record_id = NEW.upload_record_id
        AND ul.type = 'SERIES'
        AND ule.upload_list_id != NEW.upload_list_id
    ) THEN
      RAISE EXCEPTION 'Upload already belongs to a series';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER enforce_single_series
  BEFORE INSERT ON upload_list_entry
  FOR EACH ROW
  EXECUTE FUNCTION check_upload_single_series();
