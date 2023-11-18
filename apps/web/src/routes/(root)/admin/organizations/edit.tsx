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
  AdminOrganizationEditRouteDataQuery,
  AdminOrganizationEditRouteDataQueryVariables,
  AdminUpsertOrganizationMutation,
  AdminUpsertOrganizationMutationVariables,
} from './__generated__/edit';
import { UpsertForm } from '~/components/admin/upsert-form';
import { PageHeading } from '~/components/page-heading';
import { createAdminClientOrRedirect } from '~/util/gql/server';

const UpsertOrganizationSchema = z.object({
  organizationId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
});

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    async ([id = null], { request }) => {
      const client = await createAdminClientOrRedirect(request);

      const res = await client.request<
        AdminOrganizationEditRouteDataQuery,
        AdminOrganizationEditRouteDataQueryVariables
      >(
        gql`
          query AdminOrganizationEditRouteData(
            $id: ShortUuid = ""
            $prefetch: Boolean!
          ) {
            organizationById(id: $id) @include(if: $prefetch) {
              id
              type
              name
              slug
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

      const variables = UpsertOrganizationSchema.parse(
        Object.fromEntries(
          ['organizationId', 'name', 'slug', 'description'].map((p) => [
            p,
            form.get(p),
          ]),
        ),
      );

      await client.request<
        AdminUpsertOrganizationMutation,
        AdminUpsertOrganizationMutationVariables
      >(
        gql`
          mutation AdminUpsertOrganization(
            $organizationId: ShortUuid
            $name: String!
            $slug: String!
            $description: String
          ) {
            upsertOrganization(
              organizationId: $organizationId
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

      return redirect('/admin/organizations');
    },
  );

  return (
    <>
      <PageHeading
        title={`${data()?.organizationById?.id ? 'Edit' : 'New'} Organization`}
        backButton
      />
      <upsert.Form>
        <Show when={data()?.organizationById?.id} keyed>
          {(id) => <input type="hidden" name="organizationId" value={id} />}
        </Show>
        <UpsertForm
          sections={[
            {
              title: 'Meta',
              fields: [
                { type: 'text', name: 'name', label: 'Name' },
                {
                  type: 'select',
                  name: 'type',
                  label: 'Type',
                  options: [
                    { label: 'Church', value: 'CHURCH' },
                    { label: 'Ministry', value: 'MINISTRY' },
                  ],
                },
                { type: 'text', name: 'slug', label: 'Slug' },
              ],
            },
          ]}
          defaultValues={{
            name: data()?.organizationById?.name ?? '',
            type: data()?.organizationById?.type ?? 'MINISTRY',
            slug: data()?.organizationById?.slug ?? '',
          }}
          submitting={upserting.pending}
        />
      </upsert.Form>
    </>
  );
}
