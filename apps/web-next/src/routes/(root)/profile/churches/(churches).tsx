import { cache, createAsync, type RouteDefinition } from '@solidjs/router';
import { PageHeading } from '~/components/page-heading';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';

const routeData = cache(async () => {
  'use server';
  await getAuthenticatedClientOrRedirect();
}, 'new-church');

export const route = {
  load: () => {
    void routeData();
  },
} satisfies RouteDefinition;

export default function ProfileChurchesRoute() {
  createAsync(() => routeData());

  return (
    <>
      <PageHeading
        title="Churches"
        actions={[{ label: 'Add Church', variant: 'primary', href: 'new' }]}
      />
      <p>Hello</p>
    </>
  );
}
