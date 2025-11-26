-- Delete search log entries created from pagination (cursor > 0)
-- These are duplicates from infinite scroll loading more results
DELETE FROM "search_log_entry"
WHERE (params->>'cursor')::int > 0;
