import { gql } from 'graphql-request';
import * as z from 'zod';
import { Show } from 'solid-js';
import {
  type RouteDefinition,
  createAsync,
  cache,
  action,
  redirect,
  useSubmission,
} from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import {
  AdminUpsertUserMutation,
  AdminUpsertUserMutationVariables,
  AdminUserEditRouteDataQuery,
  AdminUserEditRouteDataQueryVariables,
} from './__generated__/edit';
import { UpsertForm } from '~/components/admin/upsert-form';
import { PageHeading } from '~/components/page-heading';
import { getAdminClientOrRedirect } from '~/util/gql/server';
import { AppUserRole } from '~/__generated__/graphql-types';

const UpsertUserSchema = z.object({
  userId: z.string().nullable(),
  username: z.string(),
  fullName: z.string().nullable(),
  email: z.string().email(),
  role: z.nativeEnum(AppUserRole),
  newPassword: z.string().nullable(),
});

const loadUser = cache(async () => {
  'use server';
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? '');
  const id = url.searchParams.get('id');

  const client = await getAdminClientOrRedirect();

  const res = await client.request<
    AdminUserEditRouteDataQuery,
    AdminUserEditRouteDataQueryVariables
  >(
    gql`
      query AdminUserEditRouteData($id: ShortUuid = "", $prefetch: Boolean!) {
        userById(id: $id) @include(if: $prefetch) {
          id
          username
          fullName
          emails {
            email
          }
          role
        }
      }
    `,
    { id, prefetch: Boolean(id) },
  );

  return res;
}, 'adminUser');

export const route: RouteDefinition = {
  load: () => loadUser(),
};

const upsertUser = action(async (form: FormData) => {
  'use server';
  const client = await getAdminClientOrRedirect();

  const variables = UpsertUserSchema.parse(
    Object.fromEntries(
      ['userId', 'username', 'fullName', 'email', 'role', 'newPassword'].map(
        (p) => [p, form.get(p)],
      ),
    ),
  );

  await client.request<
    AdminUpsertUserMutation,
    AdminUpsertUserMutationVariables
  >(
    gql`
      mutation AdminUpsertUser(
        $userId: ShortUuid
        $username: String
        $fullName: String
        $email: String!
        $role: AppUserRole!
        $newPassword: String
      ) {
        upsertUser(
          userId: $userId
          username: $username
          fullName: $fullName
          email: $email
          role: $role
          newPassword: $newPassword
        ) {
          id
        }
      }
    `,
    variables,
  );

  throw redirect('/admin/users');
});

export default function AdminUsersEditRoute() {
  const data = createAsync(loadUser);
  const submission = useSubmission(upsertUser);

  return (
    <>
      <PageHeading
        title={`${data()?.userById?.id ? 'Edit' : 'New'} User`}
        backButton
      />
      <form action={upsertUser} method="post">
        <Show when={data()?.userById?.id} keyed>
          {(id) => <input type="hidden" name="userId" value={id} />}
        </Show>
        <UpsertForm
          sections={[
            {
              title: 'Meta',
              fields: [
                { type: 'text', name: 'username', label: 'Username' },
                { type: 'text', name: 'fullName', label: 'Full Name' },
                { type: 'email', name: 'email', label: 'Email' },
                {
                  type: 'select',
                  name: 'role',
                  label: 'Role',
                  options: [
                    { label: 'Admin', value: 'ADMIN' },
                    { label: 'User', value: 'USER' },
                  ],
                },
                {
                  type: 'password',
                  name: 'newPassword',
                  label: 'New Password',
                },
              ],
            },
          ]}
          defaultValues={{
            username: data()?.userById?.username ?? '',
            fullName: data()?.userById?.fullName ?? '',
            email: data()?.userById?.emails[0]?.email ?? '',
            role: data()?.userById?.role ?? 'USER',
          }}
          submitting={submission.pending}
        />
      </form>
    </>
  );
}
