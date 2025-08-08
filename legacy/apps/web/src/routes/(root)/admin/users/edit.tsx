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
  AdminUpsertUserMutation,
  AdminUpsertUserMutationVariables,
  AdminUserEditRouteDataQuery,
  AdminUserEditRouteDataQueryVariables,
} from './__generated__/edit';
import { UpsertForm } from '~/components/admin/upsert-form';
import { PageHeading } from '~/components/page-heading';
import { createAdminClientOrRedirect } from '~/util/gql/server';
import { AppUserRole } from '~/__generated__/graphql-types';

const UpsertUserSchema = z.object({
  userId: z.string().nullable(),
  username: z.string(),
  fullName: z.string().nullable(),
  email: z.string().email(),
  role: z.nativeEnum(AppUserRole),
  newPassword: z.string().nullable(),
});

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    async ([id = null], { request }) => {
      const client = await createAdminClientOrRedirect(request);

      const res = await client.request<
        AdminUserEditRouteDataQuery,
        AdminUserEditRouteDataQueryVariables
      >(
        gql`
          query AdminUserEditRouteData(
            $id: ShortUuid = ""
            $prefetch: Boolean!
          ) {
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
    },
    { key: () => [location.query['id']] },
  );
}

export default function AdminNewUserRoute() {
  const data = useRouteData<typeof routeData>();

  const [upserting, upsert] = createServerAction$(
    async (form: FormData, event) => {
      const client = await createAdminClientOrRedirect(event.request);

      const variables = UpsertUserSchema.parse(
        Object.fromEntries(
          [
            'userId',
            'username',
            'fullName',
            'email',
            'role',
            'newPassword',
          ].map((p) => [p, form.get(p)]),
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

      return redirect('/admin/users');
    },
  );

  return (
    <>
      <PageHeading
        title={`${data()?.userById?.id ? 'Edit' : 'New'} User`}
        backButton
      />
      <upsert.Form>
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
          submitting={upserting.pending}
        />
      </upsert.Form>
    </>
  );
}
