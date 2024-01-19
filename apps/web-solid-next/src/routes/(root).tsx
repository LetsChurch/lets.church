import { gql } from 'graphql-request';
import { ParentProps } from 'solid-js';
import { cache, createAsync } from '@solidjs/router';
import type { MeQuery } from './__generated__/(root)';
import Footer from '~/components/footer';
import Header from '~/components/header';
import { getAuthenticatedClient } from '~/util/gql/server';
import { UserContext } from '~/util/user-context';

const getMe = cache(async function () {
  'use server';
  const client = await getAuthenticatedClient();

  return client.request<MeQuery>(gql`
    query Me {
      me {
        id
        role
        avatarUrl(resize: { width: 96, height: 96 })
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
}, 'me');

export const route = {
  load: () => getMe(),
};

export default function Home(props: ParentProps) {
  const data = createAsync(getMe);

  return (
    <UserContext.Provider value={data}>
      <Header />
      <main class="mt-5 px-2 sm:px-4 lg:px-8">
        <div class="mx-auto max-w-7xl">{props.children}</div>
      </main>
      <Footer />
    </UserContext.Provider>
  );
}
