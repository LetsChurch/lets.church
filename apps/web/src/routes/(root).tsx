import { createContext, Resource } from 'solid-js';
import { Outlet, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import type { MeQuery } from './__generated__/(root)';
import Footer from '~/components/footer';
import Header from '~/components/header';
import { createAuthenticatedClient, gql } from '~/util/gql/server';

export function routeData() {
  return createServerData$(async (_, { request }) => {
    const client = await createAuthenticatedClient(request);

    return client.request<MeQuery>(gql`
      query Me {
        me {
          id
        }
      }
    `);
  });
}

export const UserContext = createContext<Resource<MeQuery | undefined>>();

export default function Home() {
  const data = useRouteData<typeof routeData>();

  return (
    <UserContext.Provider value={data}>
      <Header />
      <main class="mt-5 px-2 sm:px-4 lg:px-8">
        <div class="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
      <Footer />
    </UserContext.Provider>
  );
}
