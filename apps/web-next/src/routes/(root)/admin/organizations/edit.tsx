import { gql } from 'graphql-request';
import * as z from 'zod';
import { Show } from 'solid-js';
import { decodeJwt } from 'jose';
import {
  action,
  cache,
  createAsync,
  redirect,
  useSubmission,
} from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import {
  AdminOrganizationEditRouteAddressCompletionQuery,
  AdminOrganizationEditRouteAddressCompletionQueryVariables,
  AdminOrganizationEditRouteDataQuery,
  AdminOrganizationEditRouteDataQueryVariables,
  AdminUpsertOrganizationMutation,
  AdminUpsertOrganizationMutationVariables,
} from './__generated__/edit';
import { UpsertForm } from '~/components/admin/upsert-form';
import { PageHeading } from '~/components/page-heading';
import { getAdminClientOrRedirect } from '~/util/gql/server';

const UpsertOrganizationSchema = z.object({
  organizationId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  addressJwt: z.string().nullable(),
});

const ParseJwtSchema = z.object({
  label: z.string(),
});

function renderLabelFromJwt(jwt: string) {
  const decoded = decodeJwt(jwt);
  return ParseJwtSchema.parse(decoded).label;
}

const loadOrganization = cache(async () => {
  'use server';
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? '');
  const id = url.searchParams.get('id');

  const client = await getAdminClientOrRedirect();

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
}, 'adminOrganization');

const getAddressCompletionOptions = async (query: string) => {
  'use server';
  const client = await getAdminClientOrRedirect();

  const res = await client.request<
    AdminOrganizationEditRouteAddressCompletionQuery,
    AdminOrganizationEditRouteAddressCompletionQueryVariables
  >(
    gql`
      query AdminOrganizationEditRouteAddressCompletion($query: String!) {
        geocodeJwt(query: $query)
      }
    `,
    { query },
  );

  return res.geocodeJwt;
};

const upsertOrganization = action(async (form: FormData) => {
  'use server';
  const client = await getAdminClientOrRedirect();

  const variables = UpsertOrganizationSchema.parse(
    Object.fromEntries(
      ['organizationId', 'name', 'slug', 'description', 'addressJwt'].map(
        (p) => [p, form.get(p)],
      ),
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
        $addressJwt: Jwt
      ) {
        upsertOrganization(
          organizationId: $organizationId
          name: $name
          slug: $slug
          description: $description
          addressJwt: $addressJwt
        ) {
          id
        }
      }
    `,
    variables,
  );

  throw redirect('/admin/organizations');
});

export default function AdminOrganizationsEditRoute() {
  const data = createAsync(loadOrganization);
  const submission = useSubmission(upsertOrganization);

  return (
    <>
      <PageHeading
        title={`${data()?.organizationById?.id ? 'Edit' : 'New'} Organization`}
        backButton
      />
      <form action={upsertOrganization}>
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
                {
                  type: 'autocomplete',
                  name: 'addressJwt',
                  label: 'New Address (tmp: move to own page)',
                  getOptions: getAddressCompletionOptions,
                  // TODO: maybe just one prop: valueAsString?
                  renderValue: (val) => (val ? renderLabelFromJwt(val) : ''),
                  renderMenuValue: (val) => renderLabelFromJwt(val),
                },
              ],
            },
          ]}
          defaultValues={{
            name: data()?.organizationById?.name ?? '',
            type: data()?.organizationById?.type ?? 'MINISTRY',
            slug: data()?.organizationById?.slug ?? '',
          }}
          submitting={submission.pending}
        />
      </form>
    </>
  );
}
