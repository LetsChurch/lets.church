import { RouteDataArgs, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import invariant from 'tiny-invariant';
import type {
  ProfileChannelQuery,
  ProfileChannelQueryVariables,
} from './__generated__/edit';
import { PageHeading } from '~/components/page-heading';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';

export function routeData({ params, location }: RouteDataArgs<{ id: string }>) {
  return createServerData$(
    async ([, id], { request }) => {
      invariant(id, 'No id provided');
      const client = await createAuthenticatedClientOrRedirect(request);

      const { channelById } = await client.request<
        ProfileChannelQuery,
        ProfileChannelQueryVariables
      >(
        gql`
          query ProfileChannel($id: ShortUuid!) {
            channelById(id: $id) {
              id
              name
            }
          }
        `,
        {
          id,
        },
      );

      return channelById;
    },
    {
      key: () => [
        'channels',
        params['id'],
        location.query['after'],
        location.query['before'],
      ],
      reconcileOptions: {
        key: 'id',
      },
    },
  );
}

export default function EditChannelRoute() {
  const data = useRouteData<typeof routeData>();

  return (
    <>
      <PageHeading title={`Edit Channel: ${data()?.name}`} backButton />
    </>
  );
}
