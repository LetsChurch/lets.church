import { For } from 'solid-js';
import { type RouteDefinition, cache, createAsync, A } from '@solidjs/router';
import { gql } from 'graphql-request';
import type {
  MyChurchesQuery,
  MyChurchesQueryVariables,
} from './__generated__/(churches)';
import { PageHeading } from '~/components/page-heading';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';

const loadChurches = cache(async () => {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();

  return client.request<MyChurchesQuery, MyChurchesQueryVariables>(gql`
    query MyChurches {
      me {
        churches: organizationMemberhipsConnection(type: CHURCH) {
          edges {
            node {
              isAdmin
              organization {
                id
                slug
                name
              }
            }
          }
        }
      }
    }
  `);
}, 'profileLoadChurches');

export const route = {
  load: () => {
    void loadChurches();
  },
} satisfies RouteDefinition;

export default function ProfileChurchesRoute() {
  const data = createAsync(() => loadChurches());

  return (
    <>
      <PageHeading
        title="Churches"
        actions={[{ label: 'Add Church', variant: 'primary', href: 'new' }]}
      />
      <ul>
        <For each={data()?.me?.churches.edges}>
          {({ node }) => (
            <li>
              <A href={`edit?id=${node.organization.id}`}>
                {node.organization.name}
              </A>
            </li>
          )}
        </For>
      </ul>
    </>
  );
}
