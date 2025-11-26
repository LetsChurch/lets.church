-- Delete search log entries where query is empty or only whitespace
DELETE FROM "search_log_entry"
WHERE "query" = '' OR trim("query") = '';
