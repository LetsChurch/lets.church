import { RouteDataArgs, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import invariant from 'tiny-invariant';
import { PageHeading } from '~/components/page-heading';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';
import type { ChannelQuery, ChannelQueryVariables } from './__generated__/[id]';

export function routeData({ params }: RouteDataArgs<{ id: string }>) {
  return createServerData$(
    async ([, id], { request }) => {
      invariant(id, 'No id provided');
      const client = await createAuthenticatedClientOrRedirect(request);

      return client.request<ChannelQuery, ChannelQueryVariables>(
        gql`
          query Channel($id: ShortUuid!) {
            channelById(id: $id) {
              name
            }
          }
        `,
        { id },
      );
    },
    { key: () => ['channels', params['id']] },
  );
}

export default function ChannelRoute() {
  const data = useRouteData<typeof routeData>();

  return (
    <>
      <PageHeading title={`Channel: ${data()?.channelById.name}`} backButton />
      <pre>{JSON.stringify(data(), null, 2)}</pre>
    </>
  );
}
