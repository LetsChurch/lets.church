import type {
  MappingProperty,
  IndicesIndexSettings,
  PropertyName,
} from '@elastic/elasticsearch/lib/api/types';
import { diff } from 'jest-diff';
import pc from 'picocolors';
import { waitForElasticsearch, client } from '../src/util/elasticsearch';
import logger from '../src/util/logger';

const moduleLogger = logger.child({ module: 'elasticsearch/mappings' });

moduleLogger.info('Waiting for Elasticsearch to be ready');
await waitForElasticsearch();
moduleLogger.info('Elasticsearch is ready');
moduleLogger.info('Starting index mapping deployment');

// Define target mappings
const targetMappings: Record<
  string, // index name
  {
    properties: Record<PropertyName, MappingProperty>;
    settings?: IndicesIndexSettings;
  }
> = {
  lc_channels: {
    properties: {
      name: {
        type: 'search_as_you_type',
      },
      description: {
        type: 'text',
      },
    },
  },
  lc_organizations: {
    properties: {
      name: {
        type: 'search_as_you_type',
      },
      description: {
        type: 'text',
      },
    },
  },
  lc_uploads_v2: {
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
      transcodingFinishedAt: {
        type: 'date',
      },
      transcribingFinishedAt: {
        type: 'date',
      },
    },
  },
  lc_transcripts: {
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
  lc_transcripts_v2: {
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
      html: {
        type: 'text',
        analyzer: 'ignore_html_tags',
      },
      transcodingFinishedAt: {
        type: 'date',
      },
      transcribingFinishedAt: {
        type: 'date',
      },
    },
    settings: {
      analysis: {
        char_filter: {
          ignore_html_tags: {
            type: 'html_strip',
          },
        },
        analyzer: {
          ignore_html_tags: {
            tokenizer: 'standard',
            filter: ['lowercase', 'stop', 'apostrophe', 'porter_stem'],
            char_filter: ['ignore_html_tags'],
            type: 'custom',
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

moduleLogger.info({ serverMappings });

// Show a preview of what will be deployed using jest-diff
moduleLogger.info('Preview of index mapping changes:');
moduleLogger.info(
  diff(
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
);

const serverIndexNames = new Set(Object.keys(serverMappings));

// Do the deployment
for (const [name, mappings] of Object.entries(targetMappings)) {
  // If ther server doesn't have an index by the given name, create it
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
