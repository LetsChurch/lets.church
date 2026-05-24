import type { estypes } from '@elastic/elasticsearch';
import { logger as baseLogger } from '@letschurch/util';
import { diff } from 'jest-diff';
import pc from 'picocolors';
import { client, waitForElasticsearch } from './index';

const logger = baseLogger.child({
  package: '@letschurch/elasticsearch',
});

const moduleLogger = logger.child({ module: 'elasticsearch/mappings' });

moduleLogger.info('Waiting for Elasticsearch to be ready');
await waitForElasticsearch();
moduleLogger.info('Elasticsearch is ready');
moduleLogger.info('Starting index mapping deployment');

// Define target mappings
const targetMappings: Record<
  string, // index name
  {
    properties: Record<estypes.PropertyName, estypes.MappingProperty>;
    settings?: estypes.IndicesIndexSettings;
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
          bibleReferences: {
            type: 'nested',
            properties: {
              book: {
                type: 'keyword',
              },
              chapter: {
                type: 'integer',
              },
              verse: {
                type: 'integer',
              },
            },
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
      // Video-level semantic vectors (cosine for RRF fusion + related-videos).
      // searchSummary text is intentionally NOT indexed — it exists only to
      // produce searchSummaryEmbedding, so users never see synthetic prose.
      summaryEmbedding: {
        type: 'dense_vector',
        dims: 1536,
        similarity: 'cosine',
        index: true,
      },
      searchSummaryEmbedding: {
        type: 'dense_vector',
        dims: 1536,
        similarity: 'cosine',
        index: true,
      },
      // Nested paragraphs — supports inner_hits on both BM25 and knn queries.
      paragraphs: {
        type: 'nested',
        properties: {
          order: { type: 'integer' },
          start: { type: 'double' },
          end: { type: 'double' },
          speaker: { type: 'keyword' },
          text: { type: 'text' },
          embedding: {
            type: 'dense_vector',
            dims: 1536,
            similarity: 'cosine',
            index: true,
          },
        },
      },
    },
  },
};

// Get server mappings and transform into expected format
const serverMappings = Object.fromEntries(
  Object.entries(await client.indices.getMapping())
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
                  Object.entries(mapping).filter(([key]) => !key.includes('_')),
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
  // If the server doesn't have an index by the given name, create it
  if (!serverIndexNames.has(name)) {
    moduleLogger.info(`Creating index: ${name}`);
    await client.indices.create({ index: name, settings: mappings.settings });
  }

  // PUT the index mapping
  moduleLogger.info(`PUTting index mapping for ${name}`);
  await client.indices.putMapping({
    index: name,
    properties: mappings.properties,
  });
}

// Done!
moduleLogger.info('All done!');
