/**
 * Let's Church stores an upload's `publishedAt` as a calendar date at UTC
 * midnight (that's what the dashboard date picker and the CSV import save, and
 * what its date formatting reads back with `timeZone: 'UTC'`).
 *
 * YouTube gives an exact publish instant, which Studio shows in the viewer's
 * local calendar. Convert to that local calendar date at UTC midnight, so a
 * video published Sunday evening in the US is "Sunday" on Let's Church too,
 * not the UTC date (Monday).
 */
export function toLetsChurchPublishedAt(ms: number): Date {
  const local = new Date(ms);
  return new Date(
    Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()),
  );
}
