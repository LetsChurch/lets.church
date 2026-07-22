// The search overview hands its settled stream snapshot to the Dig Deeper route
// through router history state. Keeping this out of the URL avoids serializing a
// full answer and its source metadata into a shareable query string.
export type DigDeeperSeed = {
  question: string;
  raw: string;
};

export function parseDigDeeperSeed(value: unknown): DigDeeperSeed | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const seed = value as Partial<DigDeeperSeed>;
  if (
    typeof seed.question !== 'string' ||
    seed.question.trim().length === 0 ||
    typeof seed.raw !== 'string' ||
    seed.raw.length === 0
  ) {
    return undefined;
  }
  return { question: seed.question, raw: seed.raw };
}

export function digDeeperSeedFromHistoryState(
  value: unknown,
): DigDeeperSeed | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return parseDigDeeperSeed(
    (value as { digDeeperSeed?: unknown }).digDeeperSeed,
  );
}
