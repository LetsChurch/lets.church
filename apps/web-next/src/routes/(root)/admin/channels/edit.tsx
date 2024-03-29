import { gql } from 'graphql-request';
import * as z from 'zod';
import { Show } from 'solid-js';
import {
  type RouteDefinition,
  action,
  cache,
  createAsync,
  redirect,
  useSubmission,
  useLocation,
} from '@solidjs/router';
import {
  AdminChannelEditRouteDataQuery,
  AdminChannelEditRouteDataQueryVariables,
  AdminUpsertChannelMutation,
  AdminUpsertChannelMutationVariables,
} from './__generated__/edit';
import { UpsertForm } from '~/components/admin/upsert-form';
import { PageHeading } from '~/components/page-heading';
import { getAdminClientOrRedirect } from '~/util/gql/server';

const UpsertChannelSchema = z.object({
  channelId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
});

const loadChannel = cache(async (id: string | null) => {
  'use server';
  const client = await getAdminClientOrRedirect();

  const res = await client.request<
    AdminChannelEditRouteDataQuery,
    AdminChannelEditRouteDataQueryVariables
  >(
    gql`
      query AdminChannelEditRouteData(
        $id: ShortUuid = ""
        $prefetch: Boolean!
      ) {
        channelById(id: $id) @include(if: $prefetch) {
          id
          name
          slug
          description
        }
      }
    `,
    { id, prefetch: Boolean(id) },
  );

  return res;
}, 'adminLoadChannel');

export const route = {
  load: ({ location }) => {
    void loadChannel(location.query['id'] ?? null);
  },
} satisfies RouteDefinition;

const upsertChannel = action(async (form: FormData) => {
  'use server';
  const client = await getAdminClientOrRedirect();

  const variables = UpsertChannelSchema.parse(
    Object.fromEntries(
      ['channelId', 'name', 'slug', 'description'].map((p) => [p, form.get(p)]),
    ),
  );

  await client.request<
    AdminUpsertChannelMutation,
    AdminUpsertChannelMutationVariables
  >(
    gql`
      mutation AdminUpsertChannel(
        $channelId: ShortUuid
        $name: String!
        $slug: String!
        $description: String
      ) {
        upsertChannel(
          channelId: $channelId
          name: $name
          slug: $slug
          description: $description
        ) {
          id
        }
      }
    `,
    variables,
  );

  throw redirect('/admin/channels');
});

export default function AdminChannelsEditRoute() {
  const location = useLocation();
  const data = createAsync(() => loadChannel(location.query['id'] ?? null));
  const submission = useSubmission(upsertChannel);

  return (
    <>
      <PageHeading
        title={`${data()?.channelById?.id ? 'Edit' : 'New'} Channel`}
        backButton
      />
      <form action={upsertChannel} method="post">
        <Show when={data()?.channelById?.id} keyed>
          {(id) => <input type="hidden" name="channelId" value={id} />}
        </Show>
        <UpsertForm
          sections={[
            {
              title: 'Meta',
              fields: [
                { type: 'text', name: 'name', label: 'Name' },
                { type: 'text', name: 'slug', label: 'Slug' },
                {
                  type: 'text',
                  rows: 5,
                  name: 'description',
                  label: 'Description',
                },
              ],
            },
          ]}
          defaultValues={{
            name: data()?.channelById?.name ?? '',
            slug: data()?.channelById?.slug ?? '',
            description: data()?.channelById?.description ?? '',
          }}
          submitting={submission.pending}
        />
      </form>
    </>
  );
}
