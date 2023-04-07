import { RouteDataArgs, useRouteData } from 'solid-start';
import { createServerAction$, createServerData$ } from 'solid-start/server';
import invariant from 'tiny-invariant';
import type {
  ProfileChannelQuery,
  ProfileChannelQueryVariables,
  UpdateChannelMutation,
  UpdateChannelMutationVariables,
} from './__generated__/edit';
import { PageHeading } from '~/components/page-heading';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';
import EditableDatalist, {
  DatalistField,
} from '~/components/editable-datalist';

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

const fields: Array<DatalistField> = [
  {
    label: 'Channel Name',
    property: 'name',
    editable: true,
  },
];

export default function EditChannelRoute() {
  const [, submitChannel] = createServerAction$(
    async (form: FormData, { request }) => {
      const channelId = form.get('channelId');
      invariant(typeof channelId === 'string', 'Invalid channelId');
      const name = form.get('name');
      invariant(typeof name === 'string', 'Invalid name');

      const client = await createAuthenticatedClientOrRedirect(request);

      return client.request<
        UpdateChannelMutation,
        UpdateChannelMutationVariables
      >(
        gql`
          mutation UpdateChannel($channelId: ShortUuid!, $name: String!) {
            updateChannel(channelId: $channelId, name: $name) {
              id
            }
          }
        `,
        {
          channelId,
          name,
        },
      );
    },
  );

  const data = useRouteData<typeof routeData>();

  return (
    <>
      <PageHeading title={`Edit Channel: ${data()?.name}`} backButton />
      <submitChannel.Form>
        <input type="hidden" name="channelId" value={data()?.id ?? ''} />
        <EditableDatalist fields={fields} data={data() ?? {}} />
      </submitChannel.Form>
    </>
  );
}
