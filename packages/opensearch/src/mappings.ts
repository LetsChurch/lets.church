import { logger as baseLogger } from '@letschurch/util';
import { diff } from 'jest-diff';
import pc from 'picocolors';

import { client, waitForOpenSearch } from './client';
import { RRF_PIPELINE } from './media-search';

const logger = baseLogger.child({
  package: '@letschurch/opensearch',
});

const moduleLogger = logger.child({ module: 'elasticsearch/mappings' });

moduleLogger.info('Waiting for Elasticsearch to be ready');
await waitForOpenSearch();
moduleLogger.info('Elasticsearch is ready');
moduleLogger.info('Starting index mapping deployment');

// Define target mappings. Loosely typed: the OpenSearch client's generated
// mapping types are thin, and these are plain JSON we send verbatim.
const targetMappings: Record<
  string, // index name
  {
    properties: Record<string, Record<string, unknown>>;
    // Creation-only settings may be static. Dynamic settings are also applied
    // to existing indexes on every push-mappings run.
    settings?: Record<string, unknown>;
    dynamicSettings?: Record<string, unknown>;
  }
> = {
  lc_channels: {
    settings: {
      number_of_replicas: 0,
    },
    properties: {
      name: {
        type: 'search_as_you_type',
      },
      visibility: {
        type: 'keyword',
      },
      description: {
        type: 'text',
      },
    },
  },
  lc_organizations: {
    settings: {
      number_of_replicas: 0,
    },
    properties: {
      name: {
        type: 'search_as_you_type',
      },
      description: {
        type: 'text',
      },
      type: {
        type: 'keyword',
      },
      tags: {
        type: 'keyword',
      },
      meetingLocation: {
        type: 'geo_point',
      },
      upstreamOrganizationAssociations: {
        type: 'keyword',
      },
      downstreamOrganizationAssociations: {
        type: 'keyword',
      },
    },
  },
  // Unified upload + transcript index for the RRF-style search. One doc per
  // upload with nested paragraphs (preserves `inner_hits` so search can show +
  // jump to the matched paragraph). The sole media search index now that the
  // legacy per-entity lc_uploads_v2 / lc_transcripts have been retired.
  lc_media_v1: {
    settings: {
      number_of_replicas: 0,
      // Enable approximate kNN (HNSW) for this index's knn_vector fields.
      // Static setting — applied at index creation, so a fresh reindex is
      // required to turn it on for an existing index.
      'index.knn': true,
    },
    dynamicSettings: {
      // Large sermon documents contain several vector fields. Refreshing once
      // per second creates many tiny vector segments during imports, which then
      // compete with searches while OpenSearch merges them. A short visibility
      // delay substantially reduces that merge churn.
      refresh_interval: '30s',
    },
    properties: {
      // identity + access-control denormalization
      channelId: { type: 'keyword' },
      visibility: { type: 'keyword' },
      channelVisibility: { type: 'keyword' },
      channelApprovedAt: { type: 'date' },
      publishedAt: { type: 'date' },
      lengthSeconds: { type: 'double' },
      transcodingFinishedAt: { type: 'date' },
      transcribingFinishedAt: { type: 'date' },
      // lexical fields (BM25)
      title: { type: 'text' },
      description: { type: 'text' },
      channelName: {
        type: 'text',
        fields: { keyword: { type: 'keyword', ignore_above: 256 } },
      },
      summary: { type: 'text' },
      // Doc-level rollup of resolved speaker names across the upload's
      // paragraphs (from speaker_attribution in index-document.ts). Powers the
      // speaker facet (terms agg) and speaker filter. Empty until the upload's
      // labels are attributed; populated via re-index.
      speakers: { type: 'keyword' },
      // Doc-level rollup of Bible verses cited in the transcript — OSIS
      // `Book.Chapter.Verse` tokens (e.g. "John.3.16"), expanded from BIBLE
      // annotations in index-document.ts. Powers the verse facet (terms agg)
      // and verse filter. Additive mapping; populated via re-index.
      bibleRefs: { type: 'keyword' },
      // Doc-level rollup of OSIS book ids cited (e.g. "Rom", "John") — the
      // coarser book facet + filter. Additive; populated via re-index.
      bibleBooks: { type: 'keyword' },
      // Video-level semantic vectors (cosine for RRF fusion + related-videos).
      // searchSummary text is intentionally NOT indexed — it exists only to
      // produce searchSummaryEmbedding, so users never see synthetic prose.
      summaryEmbedding: {
        type: 'knn_vector',
        dimension: 1536,
        space_type: 'cosinesimil',
        method: { name: 'hnsw', engine: 'faiss' },
      },
      searchSummaryEmbedding: {
        type: 'knn_vector',
        dimension: 1536,
        space_type: 'cosinesimil',
        method: { name: 'hnsw', engine: 'faiss' },
      },
      // Nested paragraphs — supports inner_hits on both BM25 and knn queries.
      paragraphs: {
        type: 'nested',
        properties: {
          order: { type: 'integer' },
          start: { type: 'double' },
          end: { type: 'double' },
          // Worker-local diarization label (SPEAKER_00, …) — not a real name.
          speaker: { type: 'keyword' },
          // The speaker-identity library's resolved values for this paragraph's
          // effective label (override ?? diarization speaker), set in
          // index-document.ts when a speaker_attribution exists. Null until the
          // label is attributed.
          speakerName: {
            type: 'text',
            fields: { keyword: { type: 'keyword', ignore_above: 256 } },
          },
          speakerId: { type: 'keyword' },
          // (Speaker vectors live in the flat `lc_speaker_vectors` index, not
          // here — see suggestSpeakersByEmbedding.)
          text: {
            type: 'text',
            // A `wildcard` multi-field for the detective's `grepTranscript`
            // exact-quote lane: it does fast, case-insensitive SUBSTRING matching
            // (`*phrase*`) — mid-word, across tokenization — which the analyzed
            // `text` field can't. Derived from `text`'s value at index time
            // (multi-field), so index requests are unchanged; it just needs the
            // docs reindexed to populate it (the window backfill does that). This
            // is the OpenSearch-native replacement for the Postgres pg_trgm index.
            fields: { wildcard: { type: 'wildcard' } },
          },
          embedding: {
            type: 'knn_vector',
            dimension: 1536,
            space_type: 'cosinesimil',
            method: { name: 'hnsw', engine: 'faiss' },
          },
        },
      },
      // Nested "windows" — story-run spans (rolling 4-paragraph, stride-2), the
      // concatenated text embedded so a story spanning several paragraphs is
      // retrievable as one coherent unit. See docs/agentic-search-overview.md.
      // Two jobs, both memory-safe by default: (1) a window exact-cosine
      // `script_score` rerank signal + a contiguous-span snippet source, and
      // (2) an on-demand semantic recall target the search agent may `knn` when
      // it decides a keyword-free story needs it (the ONLY caller that warms the
      // window HNSW graph — the deterministic lane never issues a knn clause).
      windows: {
        type: 'nested',
        properties: {
          // Paragraph-order range of the span, for snippet reconstruction.
          startOrder: { type: 'integer' },
          endOrder: { type: 'integer' },
          // Seconds — from the first/last constituent paragraph.
          start: { type: 'double' },
          end: { type: 'double' },
          // `on_disk` mode (faiss, ~32x compression): the recallWindows detective
          // tool DOES issue an approximate `knn` over this field, which loads the
          // window HNSW graph into off-heap native memory — and windows are ~half
          // the ~100GB paragraph vector set (~3.9M vectors → ~50GB), which would
          // OOM the pod. on_disk keeps a compressed graph in memory (~1.5GB) +
          // full-precision vectors on disk for rescoring, so recallWindows stays
          // fast and cannot OOM. The window RERANK (`script_score` cosine over
          // doc-values) is UNAFFECTED — on_disk preserves doc-value access
          // (verified). NOTE: `mode`/method is static, so it applies to a FRESHLY
          // created window field (prod adds it here for the first time); an index
          // that already has a plain-hnsw window field must be reindexed to adopt
          // on_disk.
          embedding: {
            type: 'knn_vector',
            dimension: 1536,
            space_type: 'cosinesimil',
            mode: 'on_disk',
          },
          // The inline constituent paragraphs [{order,start,end,text}] for
          // snippet reconstruction. `enabled: false` keeps them in _source (so
          // inner_hits return them) but does NOT index them — no nested-in-nested
          // doc explosion, and the paragraph text is not re-indexed here (it
          // already lives under `paragraphs.text`, which owns BM25).
          paras: { type: 'object', enabled: false },
        },
      },
    },
  },
  // Flat companion to lc_media_v1 for speaker-identity suggestions. One doc per
  // (upload, label) attribution = `${uploadRecordId}:${label}`, holding that
  // label's mean titanet vector. Suggestion = kNN over `embedding` +
  // collapse(speakerId): server-side, score-ranked identities, no nested-kNN /
  // aggregation limitations. Synced by index-document.ts on every media reindex.
  lc_speaker_vectors: {
    settings: {
      number_of_replicas: 0,
      'index.knn': true,
    },
    properties: {
      speakerId: { type: 'keyword' },
      channelId: { type: 'keyword' },
      uploadRecordId: { type: 'keyword' },
      embedding: {
        type: 'knn_vector',
        dimension: 192,
        space_type: 'cosinesimil',
        method: { name: 'hnsw', engine: 'faiss' },
      },
    },
  },
};

// Get server mappings and transform into expected format
const getMappingRes = await client.indices.getMapping();
const serverMappings = Object.fromEntries(
  Object.entries(
    getMappingRes.body as Record<
      string,
      { mappings: { properties?: Record<string, Record<string, unknown>> } }
    >,
  )
    .filter(([indexName]) => indexName.startsWith('lc_'))
    .map(
      ([
        indexName,
        {
          mappings: { properties },
        },
      ]) => {
        return [
          indexName,
          {
            // Filter out extra properties added by the server
            properties: Object.fromEntries(
              Object.entries(properties || {}).map(([property, mapping]) => [
                property,
                Object.fromEntries(
                  // Drop only OpenSearch-internal keys (`_`-prefixed), not valid
                  // mapping keys that merely contain an underscore (e.g.
                  // `space_type`, `ignore_above`).
                  Object.entries(mapping).filter(
                    ([key]) => !key.startsWith('_'),
                  ),
                ),
              ]),
            ),
          },
        ];
      },
    ),
);

moduleLogger.info({ context: { serverMappings } });

// Show a preview of what will be deployed using jest-diff
moduleLogger.info(
  {
    context: {
      diff: diff(
        serverMappings,
        Object.fromEntries(
          Object.entries(targetMappings).map(([k, { properties }]) => [
            k,
            { properties },
          ]),
        ),
        {
          aAnnotation: 'Server',
          aColor: pc.red,
          bAnnotation: 'Target',
          bColor: pc.green,
        },
      ),
    },
  },
  'Preview of index mapping changes',
);

const serverIndexNames = new Set(Object.keys(serverMappings));

// Do the deployment
for (const [name, mappings] of Object.entries(targetMappings)) {
  // If the server doesn't have an index by the given name, create it. Static
  // settings (e.g. `index.knn`) only apply here, so a new index must be
  // created — they can't be added to an existing index via putMapping.
  if (!serverIndexNames.has(name)) {
    moduleLogger.info(`Creating index: ${name}`);
    await client.indices.create({
      index: name,
      body: {
        settings: {
          ...mappings.settings,
          ...mappings.dynamicSettings,
        },
      },
    });
  }

  // Dynamic settings are deliberately reconciled for existing indexes too.
  // Keeping this in push-mappings makes the checked-in configuration the source
  // of truth instead of requiring one-off production API calls.
  if (mappings.dynamicSettings) {
    moduleLogger.info(`PUTting dynamic index settings for ${name}`);
    await client.indices.putSettings({
      index: name,
      body: mappings.dynamicSettings,
    });
  }

  // PUT the index mapping. Additive changes (new fields) apply in place. A change
  // a live index CAN'T take — a field's static knn `mode`/`method`/type, e.g.
  // flipping an existing `windows.embedding` from plain hnsw to `on_disk` — is
  // rejected by OpenSearch, and we let that THROW: in the init container it fails
  // the pod and stalls the rollout ON PURPOSE, so the operator recreates/reindexes
  // the index to adopt the new mapping BEFORE it goes live, rather than silently
  // running on the stale field. (A fresh index doesn't hit this — it got the
  // correct mapping at create time above.)
  moduleLogger.info(`PUTting index mapping for ${name}`);
  await client.indices.putMapping({
    index: name,
    body: { properties: mappings.properties },
  });
}

// Create / update the RRF search pipeline used by hybrid media search. The JS
// client has no typed search-pipeline API, so we issue the raw request.
moduleLogger.info(`Creating search pipeline: ${RRF_PIPELINE}`);
await client.transport.request({
  method: 'PUT',
  path: `/_search/pipeline/${RRF_PIPELINE}`,
  body: {
    description:
      'Min-max normalized, weighted fusion for lc_media_v1 hybrid search',
    phase_results_processors: [
      {
        // Score-normalized fusion instead of plain RRF: RRF fuses by RANK and
        // discards magnitude, so a much stronger lexical match reads the same as
        // a marginal one and loses to a semantically-broad result. min_max
        // normalizes each sub-query's scores to [0,1], then we take a WEIGHTED
        // arithmetic mean — so a decisive lexical win carries through, and we can
        // bias toward the lexical signal. Weights map to the hybrid sub-queries
        // in order: [BM25 lexical, doc-kNN (summary), paragraph-kNN]. Lexical is
        // weighted highest so exact/phrase matches rank where users expect.
        'normalization-processor': {
          normalization: { technique: 'min_max' },
          combination: {
            technique: 'arithmetic_mean',
            parameters: { weights: [0.5, 0.25, 0.25] },
          },
        },
      },
    ],
  },
});

// Done!
moduleLogger.info('All done!');
