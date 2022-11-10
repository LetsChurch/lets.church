import type {
  MappingProperty,
  PropertyName,
} from '@elastic/elasticsearch/lib/api/types';
import { diff } from 'jest-diff';
import chalk from 'chalk';
import { Client } from '@elastic/elasticsearch';
import envariant from '@knpwrs/envariant';
import waitOn from 'wait-on';

const ELASTICSEARCH_URL = envariant('ELASTICSEARCH_URL');

await waitOn({
  resources: [ELASTICSEARCH_URL],
});

const client = new Client({
  node: ELASTICSEARCH_URL,
});

// Define target mappings
const targetMappings: Record<
  string, // index name
  { properties: Record<PropertyName, MappingProperty> }
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
  lc_media: {
    properties: {
      channelId: {
        type: 'keyword',
      },
      title: {
        type: 'search_as_you_type',
      },
      description: {
        type: 'text',
      },
      tags: {
        type: 'search_as_you_type',
      },
      publishedAt: {
        type: 'date',
      },
    },
  },
  lc_transcripts: {
    properties: {
      sentences: {
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

console.dir({ serverMappings }, { depth: null });

// Show a preview of what will be deployed using jest-diff
console.log('Preview of index mapping changes:');
console.log(
  diff(serverMappings, targetMappings, {
    aAnnotation: 'Server',
    aColor: chalk.red,
    bAnnotation: 'Target',
    bColor: chalk.green,
  }),
);

const serverIndexNames = new Set(Object.keys(serverMappings));

// Do the deployment
for (const [name, mappings] of Object.entries(targetMappings)) {
  // If ther server doesn't have an index by the given name, create it
  if (!serverIndexNames.has(name)) {
    console.log(`Creating index: ${name}`);
    await client.indices.create({ index: name });
  }

  // PUT the index mapping
  console.log(`PUTting index mapping for ${name}`);
  await client.indices.putMapping({
    index: name,
    properties: mappings.properties,
  });
}

// Done!
console.log('All done!');
