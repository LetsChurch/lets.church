/**
 * An error's message, safe to log, store or email. A failed Drizzle query's
 * message carries its SQL parameters, which can be donor details, so keep only
 * the database's own error for those, without the rejected value Postgres
 * quotes at its end (`invalid input syntax for type uuid: "…"`).
 */
export function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  if (error.message.startsWith('Failed query:')) {
    return error.cause instanceof Error
      ? `Database query failed: ${error.cause.message.replace(/: ".*"$/s, '')}`
      : 'Database query failed';
  }
  return error.message;
}
