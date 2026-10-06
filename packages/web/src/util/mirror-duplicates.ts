/**
 * Heuristic duplicate detection for media mirrored from another platform (the
 * YouTube Studio browser extension). We don't store a source id on uploads, so
 * we compare what both sides know: title, publish date, duration, and the
 * original file name.
 *
 * - `exact`: almost certainly the same media; the extension skips it by default.
 * - `likely`: worth a human look; the extension flags it but lets the user
 *   mirror anyway.
 */

export type MirrorCandidate = {
  key: string;
  title: string;
  publishedAt: Date;
  lengthSeconds?: number | null;
  originalFileName?: string | null;
};

export type ExistingUpload = {
  id: string;
  title: string | null;
  publishedAt: Date;
  lengthSeconds: number | null;
  originalFileName: string | null;
};

export type MirrorMatchConfidence = 'exact' | 'likely';

export type MirrorMatch = {
  uploadId: string;
  title: string | null;
  confidence: MirrorMatchConfidence;
};

// Wide enough to absorb a timezone shift between "published" on YouTube and
// the date someone typed on Let's Church, narrow enough to keep weekly
// services with identical titles apart.
const DATE_TOLERANCE_MS = 36 * 60 * 60 * 1000;
// Re-encodes and container differences shift durations by a frame or two.
const LENGTH_TOLERANCE_SECONDS = 2;

export function normalizeMirrorTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[\p{P}\p{S}]+/gu, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

export function normalizeMirrorFileName(name: string): string {
  return name.normalize('NFKC').toLowerCase().trim();
}

function closeDates(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) <= DATE_TOLERANCE_MS;
}

function closeLengths(a?: number | null, b?: number | null) {
  return a != null && b != null && Math.abs(a - b) <= LENGTH_TOLERANCE_SECONDS;
}

function scoreMatch(
  candidate: MirrorCandidate,
  existing: ExistingUpload,
): MirrorMatchConfidence | null {
  const sameTitle =
    existing.title != null &&
    normalizeMirrorTitle(existing.title) ===
      normalizeMirrorTitle(candidate.title);
  const sameFile =
    !!candidate.originalFileName &&
    !!existing.originalFileName &&
    normalizeMirrorFileName(existing.originalFileName) ===
      normalizeMirrorFileName(candidate.originalFileName);
  const sameDate = closeDates(existing.publishedAt, candidate.publishedAt);
  const sameLength = closeLengths(
    existing.lengthSeconds,
    candidate.lengthSeconds,
  );

  if ((sameTitle && sameDate) || (sameFile && sameLength)) {
    return 'exact';
  }

  if (
    (sameTitle && sameLength) ||
    (sameDate && sameLength) ||
    (sameFile && sameDate)
  ) {
    return 'likely';
  }

  return null;
}

/**
 * Best match per candidate key (exact beats likely; ties keep the first
 * existing upload, so callers should pass a deterministic order).
 */
export function matchMirrorCandidates(
  candidates: ReadonlyArray<MirrorCandidate>,
  existing: ReadonlyArray<ExistingUpload>,
): Record<string, MirrorMatch> {
  const matches: Record<string, MirrorMatch> = {};

  for (const candidate of candidates) {
    for (const upload of existing) {
      const confidence = scoreMatch(candidate, upload);
      if (!confidence) {
        continue;
      }
      const current = matches[candidate.key];
      if (
        !current ||
        (current.confidence === 'likely' && confidence === 'exact')
      ) {
        matches[candidate.key] = {
          uploadId: upload.id,
          title: upload.title,
          confidence,
        };
      }
      if (confidence === 'exact') {
        break;
      }
    }
  }

  return matches;
}

/** Publish-date window that covers every candidate plus the match tolerance. */
export function mirrorCandidateDateWindow(
  candidates: ReadonlyArray<MirrorCandidate>,
): { from: Date; to: Date } | null {
  if (candidates.length === 0) {
    return null;
  }
  const times = candidates.map((c) => c.publishedAt.getTime());
  return {
    from: new Date(Math.min(...times) - DATE_TOLERANCE_MS),
    to: new Date(Math.max(...times) + DATE_TOLERANCE_MS),
  };
}
