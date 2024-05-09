import { Show } from 'solid-js';
import {
  type RouteDefinition,
  cache,
  createAsync,
  useLocation,
} from '@solidjs/router';
import { gql } from 'graphql-request';
import invariant from 'tiny-invariant';
import {
  ProfileChurchEditRouteDataQuery,
  ProfileChurchEditRouteDataQueryVariables,
} from './__generated__/edit';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';
import { PageHeading } from '~/components/page-heading';
import ChurchForm from '~/components/settings/church-form';

const loadChurch = cache(async (id: string) => {
  'use server';
  invariant(id, 'No ID provided');

  const client = await getAuthenticatedClientOrRedirect();

  const res = await client.request<
    ProfileChurchEditRouteDataQuery,
    ProfileChurchEditRouteDataQueryVariables
  >(
    gql`
      query ProfileChurchEditRouteData($id: ShortUuid!) {
        organizationById(id: $id) {
          id
          name
          slug
          description
          primaryEmail
          primaryPhoneNumber
          tags {
            edges {
              node {
                tag {
                  slug
                }
              }
            }
          }
          addresses {
            edges {
              node {
                type
                name # TODO
                country
                streetAddress
                locality
                region
                postalCode
              }
            }
          }
          leaders {
            edges {
              node {
                type
                name
                email
                phoneNumber
              }
            }
          }
          upstreamAssociationsConnection {
            edges {
              node {
                upstreamOrganization {
                  id
                }
              }
            }
          }
        }
      }
    `,
    { id },
  );

  return {
    ...res.organizationById,
    tags: res.organizationById?.tags.edges.map((e) => e.node.tag.slug),
    addresses: res.organizationById?.addresses.edges.map((e) => e.node),
    leaders: res.organizationById?.leaders.edges.map((e) => e.node),
    upstreamAssociations:
      res.organizationById?.upstreamAssociationsConnection.edges.map(
        (e) => e.node.upstreamOrganization.id,
      ),
  };
}, 'profileChurch');

export const route = {
  load: ({ location }) => {
    const id = location.query['id'];
    invariant(id, 'No ID provided');
    void loadChurch(id);
  },
} satisfies RouteDefinition;

export default function AdminOrganizationsEditRoute() {
  const location = useLocation();
  const data = createAsync(() => loadChurch(location.query['id'] ?? ''));

  return (
    <>
      <PageHeading title={`${data()?.id ? 'Edit' : 'New'} Church`} backButton />
      <Show when={data()} keyed>
        {(initialValues) => <ChurchForm initialValues={initialValues} />}
      </Show>
    </>
  );
}
