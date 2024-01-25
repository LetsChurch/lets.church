import { Feed } from 'feed';
import { gql } from 'graphql-request';
import invariant from 'tiny-invariant';
import { getRequestEvent } from 'solid-js/web';
import {
  ChannelLatestRssFeedQuery,
  ChannelLatestRssFeedQueryVariables,
} from './__generated__/rss.xml';
import { getAuthenticatedClient } from '~/util/gql/server';
import xss from '~/util/xss';

export async function GET() {
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? '');
  const slug = url.pathname.split('/').at(-1);

  invariant(slug, 'Missing slug');

  const client = await getAuthenticatedClient();

  const data = await client.request<
    ChannelLatestRssFeedQuery,
    ChannelLatestRssFeedQueryVariables
  >(
    gql`
      query ChannelLatestRssFeed($slug: String!) {
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
                publishedAt
              }
            }
          }
        }
      }
    `,
    { slug },
  );

  const feed = new Feed({
    title: `New Media from ${data.channelBySlug.name} on Let's Church`,
    description: `New Media from ${data.channelBySlug.name} Uploaded to Let's Church`,
    id: `http://lets.church/channel/${slug}`,
    link: `http://lets.church/${slug}`,
    image:
      data.channelBySlug.defaultThumbnailUrl ??
      'https://lets.church/favicon.svg',
    favicon: 'https://lets.church/favicon.svg',
    copyright: 'Varies',
    feedLinks: {
      json: `https://lets.church/channel/${slug}/rss.xml`,
    },
  });

  for (const { node } of data.channelBySlug.uploadsConnection.edges) {
    feed.addItem({
      id: node.id,
      title: node.title ?? 'Untitled Upload',
      link: `https://lets.church/media/${node.id}`,
      description: node.description ?? '',
      date: new Date(node.publishedAt ?? Date.now()),
      content: `<p><img src="${
        node.thumbnailUrl ?? data.channelBySlug.defaultThumbnailUrl
      }" /><p><p>${xss.process(node.description ?? '')}</p>`,
      author: [
        {
          name: data.channelBySlug.name,
          link: `https://lets.church/channel/${slug}`,
        },
      ],
    });
  }

  return new Response(feed.rss2(), {
    status: 200,
    headers: { 'Content-Type': 'application/rss+xml' },
  });
}
