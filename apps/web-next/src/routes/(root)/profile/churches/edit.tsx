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
import { getAdminClientOrRedirect } from '~/util/gql/server';
import { PageHeading } from '~/components/page-heading';
import ChurchForm from '~/components/settings/church-form';
import {
  OrganizationAddressType,
  OrganizationLeaderType,
} from '~/__generated__/graphql-types';

function transformAddress(
  address: ProfileChurchEditRouteDataQuery['organizationById']['addresses']['edges'][number]['node'],
) {
  return {
    ...address,
    type:
      address.type === OrganizationAddressType.Meeting
        ? ('Meeting' as const)
        : address.type === OrganizationAddressType.Office
          ? ('Office' as const)
          : address.type === OrganizationAddressType.Mailing
            ? ('Mailing' as const)
            : ('Other' as const),
  };
}

function transformLeader(
  leader: ProfileChurchEditRouteDataQuery['organizationById']['leaders']['edges'][number]['node'],
) {
  return {
    ...leader,
    type:
      leader.type === OrganizationLeaderType.Elder
        ? ('Elder' as const)
        : leader.type === OrganizationLeaderType.Deacon
          ? ('Deacon' as const)
          : ('Other' as const),
  };
}

const loadChurch = cache(async (id: string) => {
  'use server';
  invariant(id, 'No ID provided');

  const client = await getAdminClientOrRedirect();

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
        }
      }
    `,
    { id },
  );

  return {
    ...res.organizationById,
    addresses: res.organizationById?.addresses.edges.map((e) =>
      transformAddress(e.node),
    ),
    leaders: res.organizationById?.leaders.edges.map((e) =>
      transformLeader(e.node),
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
