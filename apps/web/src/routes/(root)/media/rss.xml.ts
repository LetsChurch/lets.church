import { Feed } from 'feed';
import { gql } from 'graphql-request';
import type { APIEvent } from 'solid-start';
import {
  LatestRssFeedQuery,
  LatestRssFeedQueryVariables,
} from './__generated__/rss.xml';
import { createAuthenticatedClient } from '~/util/gql/server';
import xss from '~/util/xss';

export async function GET(event: APIEvent) {
  const feed = new Feed({
    title: "Let's Church New Media",
    description: "New Media Uploaded to Let's Church",
    id: 'http://lets.church/',
    link: 'http://lets.church/',
    image: 'https://lets.church/favicon.svg',
    favicon: 'https://lets.church/favicon.svg',
    copyright: 'Varies',
    feedLinks: {
      json: 'https://lets.church/media/rss.xml',
    },
  });

  const client = await createAuthenticatedClient(event.request);

  const data = await client.request<
    LatestRssFeedQuery,
    LatestRssFeedQueryVariables
  >(gql`
    query LatestRssFeed {
      uploadRecords(orderBy: latest, first: 500) {
        edges {
          cursor
          node {
            id
            title
            description
            thumbnailUrl(resize: { width: 512, height: 288 })
            publishedAt
            channel {
              name
              defaultThumbnailUrl(resize: { width: 512, height: 288 })
              slug
            }
          }
        }
      }
    }
  `);

  for (const { node } of data.uploadRecords.edges) {
    feed.addItem({
      id: node.id,
      title: node.title ?? 'Untitled Upload',
      link: `https://lets.church/media/${node.id}`,
      description: node.description ?? '',
      date: new Date(node.publishedAt ?? Date.now()),
      content: `<p><img src="${
        node.thumbnailUrl ?? node.channel.defaultThumbnailUrl
      }" /><p><p>${xss.process(node.description ?? '')}</p>`,
      author: [
        {
          name: node.channel.name,
          link: `https://lets.church/channel/${node.channel.slug}`,
        },
      ],
    });
  }

  return new Response(feed.rss2(), {
    status: 200,
    headers: { 'Content-Type': 'application/rss+xml' },
  });
}
