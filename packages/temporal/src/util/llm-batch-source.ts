import { createHash } from 'node:crypto';

const SOURCE_FINGERPRINT_LENGTH = 20;
const SOURCE_FINGERPRINT_RE = /^[a-f0-9]{20}$/;

export type BatchSourceMetadata = {
  channelName: string;
  title: string | null;
  description: string | null;
};

export type BatchCustomIdKind =
  | 'annotate'
  | 'summarize'
  | 'embed-paragraphs'
  | 'embed-summary';

export type ParsedBatchCustomId = {
  kind: BatchCustomIdKind;
  uploadId: string;
  sourceFingerprint: string | null;
  chunkIdx: number | null;
};

type WordSource = { word: string; start: number; end: number };

function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, SOURCE_FINGERPRINT_LENGTH);
}

export function fingerprintAnnotationSource(
  metadata: BatchSourceMetadata,
  paragraphs: ReadonlyArray<{
    id: string;
    order: number;
    text: string;
    words: ReadonlyArray<WordSource>;
  }>,
): string {
  return fingerprint({
    metadata: {
      channelName: metadata.channelName,
      title: metadata.title,
      description: metadata.description,
    },
    paragraphs: paragraphs.map(({ id, order, text, words }) => ({
      id,
      order,
      text,
      words: words.map(({ word, start, end }) => ({ word, start, end })),
    })),
  });
}

export function fingerprintSummarySource(
  metadata: BatchSourceMetadata,
  paragraphs: ReadonlyArray<{ id: string; order: number; text: string }>,
  sections: ReadonlyArray<{
    id: string;
    title: string;
    firstParagraphOrder: number;
  }>,
): string {
  return fingerprint({
    metadata: {
      channelName: metadata.channelName,
      title: metadata.title,
      description: metadata.description,
    },
    paragraphs: paragraphs.map(({ id, order, text }) => ({ id, order, text })),
    sections: sections.map(({ id, title, firstParagraphOrder }) => ({
      id,
      title,
      firstParagraphOrder,
    })),
  });
}

export function fingerprintParagraphEmbeddingSource(
  paragraphs: ReadonlyArray<{ id: string; order: number; text: string }>,
): string {
  return fingerprint(
    paragraphs.map(({ id, order, text }) => ({ id, order, text })),
  );
}

export function fingerprintSummaryEmbeddingSource(
  summary: string,
  searchSummary: string,
): string {
  return fingerprint({ summary, searchSummary });
}

export function fingerprintTranscriptSource(
  paragraphs: ReadonlyArray<{
    order: number;
    start: number;
    end: number;
    speaker: string | null;
    speakerEmbedding: unknown;
    text: string;
    words: ReadonlyArray<WordSource>;
  }>,
): string {
  return fingerprint(
    paragraphs.map(
      ({ order, start, end, speaker, speakerEmbedding, text, words }) => ({
        order,
        start,
        end,
        speaker,
        speakerEmbedding,
        text,
        words: words.map(({ word, start, end }) => ({ word, start, end })),
      }),
    ),
  );
}

const PREFIX_BY_KIND: Record<BatchCustomIdKind, string> = {
  annotate: 'a',
  summarize: 's',
  'embed-paragraphs': 'ep',
  'embed-summary': 'es',
};

const KIND_BY_PREFIX = new Map(
  Object.entries(PREFIX_BY_KIND).map(([kind, prefix]) => [
    prefix,
    kind as BatchCustomIdKind,
  ]),
);

export function buildBatchCustomId(
  kind: BatchCustomIdKind,
  uploadId: string,
  sourceFingerprint: string,
  chunkIdx: number | null = null,
): string {
  if (!uploadId || !SOURCE_FINGERPRINT_RE.test(sourceFingerprint)) {
    throw new Error(`Invalid Batch API custom-id source for ${kind}`);
  }
  const isParagraphChunk = kind === 'embed-paragraphs';
  if (
    isParagraphChunk !==
    (chunkIdx !== null && Number.isSafeInteger(chunkIdx) && chunkIdx >= 0)
  ) {
    throw new Error(`Invalid Batch API chunk index for ${kind}`);
  }
  const customId = [
    PREFIX_BY_KIND[kind],
    uploadId,
    sourceFingerprint,
    ...(chunkIdx === null ? [] : [String(chunkIdx)]),
  ].join(':');
  if (customId.length > 64) {
    throw new Error(`Batch API custom_id exceeds 64 characters: ${customId}`);
  }
  return customId;
}
const ANTHROPIC_ANNOTATE_CUSTOM_ID_RE =
  /^a_([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})_([a-f0-9]{20})$/;

export function buildAnthropicAnnotationBatchCustomId(
  uploadId: string,
  sourceFingerprint: string,
): string {
  const customId = `a_${uploadId}_${sourceFingerprint}`;
  if (!ANTHROPIC_ANNOTATE_CUSTOM_ID_RE.test(customId)) {
    throw new Error(
      `Invalid Anthropic Message Batch annotation custom_id: ${customId}`,
    );
  }
  return customId;
}

export function parseAnthropicAnnotationBatchCustomId(
  customId: string,
): ParsedBatchCustomId {
  const match = ANTHROPIC_ANNOTATE_CUSTOM_ID_RE.exec(customId);
  if (!match?.[1] || !match[2]) {
    throw new Error(
      `Malformed Anthropic Message Batch annotation custom_id: ${customId}`,
    );
  }
  return {
    kind: 'annotate',
    uploadId: match[1],
    sourceFingerprint: match[2],
    chunkIdx: null,
  };
}

/**
 * Parses current fingerprinted IDs and legacy IDs that may still be in flight
 * during deployment. Legacy IDs return a null fingerprint and are rejected by
 * the apply-side source check, causing a safe resubmission instead of applying
 * unverifiable output.
 */
export function parseBatchCustomId(customId: string): ParsedBatchCustomId {
  const parts = customId.split(':');
  const currentKind = KIND_BY_PREFIX.get(parts[0] ?? '');
  if (currentKind) {
    const expectedParts = currentKind === 'embed-paragraphs' ? 4 : 3;
    const sourceFingerprint = parts[2] ?? '';
    const chunkRaw = currentKind === 'embed-paragraphs' ? parts[3] : undefined;
    const chunkIdx = chunkRaw === undefined ? null : parseChunkIndex(chunkRaw);
    if (
      parts.length !== expectedParts ||
      !parts[1] ||
      !SOURCE_FINGERPRINT_RE.test(sourceFingerprint) ||
      (currentKind === 'embed-paragraphs' && chunkIdx === null)
    ) {
      throw new Error(`Malformed Batch API custom_id: ${customId}`);
    }
    return {
      kind: currentKind,
      uploadId: parts[1],
      sourceFingerprint,
      chunkIdx,
    };
  }

  const legacyKind = parts[0];
  if (
    legacyKind === 'annotate' ||
    legacyKind === 'summarize' ||
    legacyKind === 'embed-summary'
  ) {
    if (parts.length !== 2 || !parts[1]) {
      throw new Error(`Malformed legacy Batch API custom_id: ${customId}`);
    }
    return {
      kind: legacyKind,
      uploadId: parts[1],
      sourceFingerprint: null,
      chunkIdx: null,
    };
  }
  const legacyChunkIdx = parseChunkIndex(parts[2] ?? '');
  if (
    legacyKind === 'embed-paragraphs' &&
    parts.length === 3 &&
    parts[1] &&
    legacyChunkIdx !== null
  ) {
    return {
      kind: legacyKind,
      uploadId: parts[1],
      sourceFingerprint: null,
      chunkIdx: legacyChunkIdx,
    };
  }
  throw new Error(`Malformed Batch API custom_id: ${customId}`);
}

function parseChunkIndex(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function assertBatchSourceCurrent(
  customId: string,
  submittedFingerprint: string | null,
  currentFingerprint: string,
): asserts submittedFingerprint is string {
  if (submittedFingerprint === null) {
    throw new Error(
      `Batch line ${customId} has no source fingerprint; reject and resubmit safely`,
    );
  }
  if (submittedFingerprint !== currentFingerprint) {
    throw new Error(
      `Batch line ${customId} is stale: submitted source ${submittedFingerprint}, current source ${currentFingerprint}`,
    );
  }
}
