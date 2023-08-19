import { Outlet, useRouteData } from 'solid-start';
import { createServerData$, json, useRequest } from 'solid-start/server';
import { gql } from 'graphql-request';
import { createResource, For, Show, untrack } from 'solid-js';
import type { MeQuery } from './__generated__/(root)';
import Header from '~/components/header';
import Footer from '~/components/footer';
import Alert from '~/components/alert';
import { createAuthenticatedClient } from '~/util/gql/server';
import { UserContext } from '~/util/user-context';
import { getSuccessMessages } from '~/util/session';

export function routeData() {
  const user = createServerData$(async (_, { request }) => {
    const client = await createAuthenticatedClient(request);

    return client.request<MeQuery>(gql`
      query Me {
        me {
          id
          avatarUrl
          canUpload
          username
          fullName
          subscribedToNewsletter
          emails {
            email
          }
        }
      }
    `);
  });

  const successData = createServerData$(async (_, { request }) => {
    const { success, ...res } = await getSuccessMessages(request);

    const serverRequest = useRequest();

    if (serverRequest.responseHeaders) {
      serverRequest.responseHeaders.append(
        'Set-Cookie',
        res.headers['Set-Cookie'],
      );
    }

    return json(success, res);
  });

  return { user, successData };
}

export default function Home() {
  const { user, successData } = useRouteData<typeof routeData>();
  const [success, { mutate: mutateSuccess }] = createResource(
    successData,
    (s) => s.json?.().then((data) => Array.from<string>(data)),
  );

  function removeSuccess(i: number) {
    mutateSuccess([
      ...(success()?.slice(0, i) ?? []),
      ...(success()?.slice(i + 1) ?? []),
    ]);
  }

  return (
    <UserContext.Provider value={user}>
      <Header />
      <Show when={success()?.length}>
        <div class="max-w-7xl mx-auto space-y-3 mt-3">
          <For each={success()}>
            {(message, i) => (
              <Alert
                message={message}
                onDismiss={() => {
                  removeSuccess(untrack(() => i()));
                }}
              />
            )}
          </For>
        </div>
      </Show>
      <main class="mt-5 px-2 sm:px-4 lg:px-8">
        <div class="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
      <Footer />
    </UserContext.Provider>
  );
}
