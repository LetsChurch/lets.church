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
    settings?: Record<string, unknown>;
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
  lc_uploads_v2: {
    settings: {
      number_of_replicas: 0,
    },
    properties: {
      channelId: {
        type: 'keyword',
      },
      title: {
        type: 'text',
      },
      description: {
        type: 'text',
      },
      tags: {
        type: 'text',
      },
      publishedAt: {
        type: 'date',
      },
      visibility: {
        type: 'keyword',
      },
      channelVisibility: {
        type: 'keyword',
      },
      transcodingFinishedAt: {
        type: 'date',
      },
      transcribingFinishedAt: {
        type: 'date',
      },
    },
  },
  lc_transcripts: {
    settings: {
      number_of_replicas: 0,
    },
    properties: {
      channelId: {
        type: 'keyword',
      },
      publishedAt: {
        type: 'date',
      },
      visibility: {
        type: 'keyword',
      },
      channelVisibility: {
        type: 'keyword',
      },
      segments: {
        type: 'nested',
        properties: {
          start: {
            type: 'integer',
          },
          end: {
            type: 'integer',
          },
          text: {
            type: 'text',
          },
        },
      },
      transcodingFinishedAt: {
        type: 'date',
      },
      transcribingFinishedAt: {
        type: 'date',
      },
    },
  },
  // Unified upload + transcript index for the new RRF-style search. One doc
  // per upload with nested paragraphs (preserves `inner_hits` so future search
  // can show + jump to the matched paragraph, mirroring lc_transcripts). The
  // existing lc_uploads_v2 and lc_transcripts stay populated for current
  // search; this index is additive.
  lc_media_v1: {
    settings: {
      number_of_replicas: 0,
      // Enable approximate kNN (HNSW) for this index's knn_vector fields.
      // Static setting — applied at index creation, so a fresh reindex is
      // required to turn it on for an existing index.
      'index.knn': true,
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
      // Reserved for a future speaker-identity library: a doc-level rollup of
      // resolved speaker names across the upload's paragraphs. Empty until that
      // library exists; populated via re-index (mapping additions are additive,
      // so no churn). The query parser already extracts speaker names, so once
      // this is filled, speaker queries can flip from lexical-only to a real
      // `terms` filter with no schema change.
      speakers: { type: 'keyword' },
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
          // Reserved for the future speaker-identity library: the resolved
          // human name for this paragraph's speaker. Null until then.
          speakerName: {
            type: 'text',
            fields: { keyword: { type: 'keyword', ignore_above: 256 } },
          },
          text: { type: 'text' },
          embedding: {
            type: 'knn_vector',
            dimension: 1536,
            space_type: 'cosinesimil',
            method: { name: 'hnsw', engine: 'faiss' },
          },
        },
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
      body: { settings: mappings.settings },
    });
  }

  // PUT the index mapping
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
    description: 'Reciprocal Rank Fusion for lc_media_v1 hybrid search',
    phase_results_processors: [
      {
        'score-ranker-processor': {
          combination: { technique: 'rrf', rank_constant: 60 },
        },
      },
    ],
  },
});

// Done!
moduleLogger.info('All done!');
