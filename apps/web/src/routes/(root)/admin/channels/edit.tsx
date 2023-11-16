import { gql } from 'graphql-request';
import { RouteDataArgs, useRouteData } from 'solid-start';
import {
  createServerAction$,
  createServerData$,
  redirect,
} from 'solid-start/server';
import * as z from 'zod';
import { Show } from 'solid-js';
import {
  AdminChannelEditRouteDataQuery,
  AdminChannelEditRouteDataQueryVariables,
} from './__generated__/edit';
import { UpsertForm } from '~/components/admin/upsert-form';
import { PageHeading } from '~/components/page-heading';
import { createAdminClientOrRedirect } from '~/util/gql/server';

const UpsertChannelSchema = z.object({
  channelId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
});

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    async ([id = null], { request }) => {
      const client = await createAdminClientOrRedirect(request);

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
    },
    { key: () => [location.query['id']] },
  );
}

export default function AdminNewUserRoute() {
  const data = useRouteData<typeof routeData>();

  const [upserting, upsert] = createServerAction$(
    async (form: FormData, event) => {
      const client = await createAdminClientOrRedirect(event.request);

      const variables = UpsertChannelSchema.parse(
        Object.fromEntries(
          ['channelId', 'name', 'slug', 'description'].map((p) => [
            p,
            form.get(p),
          ]),
        ),
      );

      await client.request(
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

      return redirect('/admin/channels');
    },
  );

  return (
    <>
      <PageHeading
        title={`${data()?.channelById?.id ? 'Edit' : 'New'} Channel`}
        backButton
      />
      <upsert.Form>
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
          submitting={upserting.pending}
        />
      </upsert.Form>
    </>
  );
}
