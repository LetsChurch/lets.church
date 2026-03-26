import { db, TrackingSalt } from '@letschurch/db';
import { desc, eq } from 'drizzle-orm';

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random#getting_a_random_integer_between_two_values_inclusive
function getRandomIntInclusive(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min); // The maximum is inclusive and the minimum is inclusive
}

export default async function updateDailySalt() {
  const old = await db
    .select({ id: TrackingSalt.id })
    .from(TrackingSalt)
    .orderBy(desc(TrackingSalt.id))
    .limit(1)
    .then((r) => r[0] ?? null);

  await db.insert(TrackingSalt).values({
    salt: getRandomIntInclusive(-2147483648, 2147483647),
  });

  if (old) {
    await db.delete(TrackingSalt).where(eq(TrackingSalt.id, old.id));
  }
}
