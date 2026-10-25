import { z } from 'zod';

// Every index and search-pipeline name the web app owns, behind one optional
// prefix. Production and the primary dev checkout leave OPENSEARCH_INDEX_PREFIX
// unset, so the names are exactly `lc_media_v1` etc. Dev worktrees share one
// OpenSearch cluster and each sets its own prefix (`<worktree>__`) so a branch
// can reindex or change mappings without touching anyone else's indices (see
// docs/worktrees.md). Always reference these constants — a bare 'lc_*' literal
// would silently read the primary checkout's index from inside a worktree.
const { OPENSEARCH_INDEX_PREFIX } = z
  .object({
    // OpenSearch index names must be lowercase and can't start with `_`/`-`.
    OPENSEARCH_INDEX_PREFIX: z
      .string()
      .regex(/^([a-z0-9][a-z0-9_-]*)?$/)
      .default(''),
  })
  .parse(process.env);

export const INDEX_PREFIX = OPENSEARCH_INDEX_PREFIX;

export const MEDIA_INDEX = `${INDEX_PREFIX}lc_media_v1`;

// Flat companion index for speaker suggestions: one doc per (upload, label)
// attribution, holding that label's mean 192-dim titanet vector + speakerId +
// channelId. kNN + collapse(speakerId) over this gives server-side, score-ranked
// identity suggestions (see suggestSpeakersByEmbedding).
export const SPEAKER_VECTOR_INDEX = `${INDEX_PREFIX}lc_speaker_vectors`;

export const CHANNEL_INDEX = `${INDEX_PREFIX}lc_channels`;

export const ORGANIZATION_INDEX = `${INDEX_PREFIX}lc_organizations`;

// Search pipeline (PUT in mappings.ts) that normalizes + weight-fuses the hybrid
// sub-queries. Id kept as `lc-media-rrf` though it no longer uses RRF.
export const RRF_PIPELINE = `${INDEX_PREFIX}lc-media-rrf`;
