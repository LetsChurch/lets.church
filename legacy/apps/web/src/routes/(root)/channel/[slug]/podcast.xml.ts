import { Podcast } from 'podcast';
import { gql } from 'graphql-request';
import type { APIEvent } from 'solid-start';
import invariant from 'tiny-invariant';
import {
  ChannelLatestPodcastFeedQuery,
  ChannelLatestPodcastFeedQueryVariables,
} from './__generated__/podcast.xml';
import { createAuthenticatedClient } from '~/util/gql/server';
import xss from '~/util/xss';

export async function GET(event: APIEvent) {
  const slug = event.params?.['slug'];
  invariant(slug, 'slug is required');

  const client = await createAuthenticatedClient(event.request);

  const data = await client.request<
    ChannelLatestPodcastFeedQuery,
    ChannelLatestPodcastFeedQueryVariables
  >(
    gql`
      query ChannelLatestPodcastFeed($slug: String!) {
        channelBySlug(slug: $slug) {
          name
          defaultThumbnailUrl(resize: { width: 512, height: 288 })
          uploadsConnection(orderBy: publishedAt, first: 500) {
            edges {
              cursor
              node {
                id
                title
                description
                thumbnailUrl(resize: { width: 512, height: 288 })
                podcastSource
                podcastSizeBytes
                publishedAt
              }
            }
          }
        }
      }
    `,
    { slug },
  );

  const feed = new Podcast({
    title: data.channelBySlug.name,
    description: `New Media from ${data.channelBySlug.name} Uploaded to Let's Church`,
    feedUrl: `http://lets.church/${slug}`,
    siteUrl: `https://lets.church/channel/${slug}`,
    imageUrl:
      data.channelBySlug.defaultThumbnailUrl ??
      'https://lets.church/favicon.svg',
  });

  for (const { node } of data.channelBySlug.uploadsConnection.edges) {
    feed.addItem({
      title: node.title ?? 'Untitled Upload',
      url: `https://lets.church/media/${node.id}`,
      description: node.description ?? '',
      date: new Date(node.publishedAt ?? Date.now()),
      content: `<p><img src="${
        node.thumbnailUrl ?? data.channelBySlug.defaultThumbnailUrl
      }" /><p><p>${xss.process(node.description ?? '')}</p>`,
      enclosure: {
        url: node.podcastSource,
        size: node.podcastSizeBytes,
      },
    });
  }

  return new Response(feed.buildXml(), {
    status: 200,
    headers: { 'Content-Type': 'application/rss+xml' },
  });
}
