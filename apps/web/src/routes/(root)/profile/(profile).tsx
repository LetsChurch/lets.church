import { createSignal, Show } from 'solid-js';
import server$, {
  createServerAction$,
  createServerData$,
} from 'solid-start/server';
import { refetchRouteData, useRouteData } from 'solid-start';
import invariant from 'tiny-invariant';
import delay from 'delay';
import { gql } from 'graphql-request';
import type {
  CreateAvatarUploadMutation,
  CreateAvatarUploadMutationVariables,
  FinalizeAvatarUploadMutation,
  FinalizeAvatarUploadMutationVariables,
  ProfilePageDataQuery,
  ProfilePageDataQueryVariables,
  UpdateUserMutation,
  UpdateUserMutationVariables,
} from './__generated__/(profile)';
import { createAuthenticatedClientOrRedirect } from '~/util/gql/server';
import { PageHeading } from '~/components/page-heading';
import { UploadPostProcess } from '~/__generated__/graphql-types';
import { doMultipartUpload } from '~/util/multipart-upload';
import { Avatar } from '~/components/avatar';
import type { DatalistField } from '~/components/editable-datalist';
import EditableDatalist from '~/components/editable-datalist';

const fields: Array<DatalistField> = [
  {
    label: 'Username',
    property: 'username',
    editable: false,
  },
  {
    label: 'Full name',
    property: 'fullName',
    editable: true,
  },
  {
    label: 'Email address',
    property: 'email',
    editable: true,
    type: 'email',
  },
];

export function routeData() {
  const data = createServerData$(async (_, { request }) => {
    const client = await createAuthenticatedClientOrRedirect(request);
    return await client.request<
      ProfilePageDataQuery,
      ProfilePageDataQueryVariables
    >(gql`
      query ProfilePageData {
        me {
          id
          username
          fullName
          avatarUrl
          emails {
            email
          }
        }
      }
    `);
  });

  return { data };
}

export default function ProfileRoute() {
  const createAvatarUpload = server$(
    async (variables: CreateAvatarUploadMutationVariables) => {
      const client = await createAuthenticatedClientOrRedirect(server$.request);

      const data = await client.request<
        CreateAvatarUploadMutation,
        CreateAvatarUploadMutationVariables
      >(
        gql`
          mutation CreateAvatarUpload(
            $targetId: ShortUuid!
            $bytes: SafeInt!
            $uploadMimeType: String!
            $postProcess: UploadPostProcess!
          ) {
            createMultipartUpload(
              targetId: $targetId
              bytes: $bytes
              uploadMimeType: $uploadMimeType
              postProcess: $postProcess
            ) {
              s3UploadKey
              s3UploadId
              partSize
              urls
            }
          }
        `,
        variables,
      );

      return data;
    },
  );

  const finalizeUpload = server$(
    async (variables: FinalizeAvatarUploadMutationVariables) => {
      const client = await createAuthenticatedClientOrRedirect(server$.request);

      const data = await client.request<
        FinalizeAvatarUploadMutation,
        FinalizeAvatarUploadMutationVariables
      >(
        gql`
          mutation FinalizeAvatarUpload(
            $targetId: ShortUuid!
            $s3UploadKey: String!
            $s3UploadId: String!
            $s3PartETags: [String!]!
          ) {
            finalizeMultipartUpload(
              targetId: $targetId
              s3UploadKey: $s3UploadKey
              s3UploadId: $s3UploadId
              s3PartETags: $s3PartETags
            )
          }
        `,
        variables,
      );

      return data;
    },
  );

  const { data } = useRouteData<typeof routeData>();
  const [avatarProcessing, setAvatarProcessing] = createSignal(false);

  const [, submitProfile] = createServerAction$(
    async (form: FormData, { request }) => {
      const userId = form.get('userId');
      invariant(typeof userId === 'string', 'Invalid userId');
      const fullName = form.get('fullName');
      invariant(typeof fullName === 'string', 'Invalid fullName');
      const email = form.get('email');
      invariant(typeof email === 'string', 'Invalid email');

      const client = await createAuthenticatedClientOrRedirect(request);

      return client.request<UpdateUserMutation, UpdateUserMutationVariables>(
        gql`
          mutation UpdateUser(
            $userId: ShortUuid!
            $fullName: String!
            $email: String!
          ) {
            updateUser(userId: $userId, fullName: $fullName, email: $email) {
              id
            }
          }
        `,
        {
          userId,
          fullName,
          email,
        },
      );
    },
  );

  async function handleAvatarInput(e: InputEvent) {
    if (avatarProcessing()) {
      return;
    }

    invariant(e.target instanceof HTMLInputElement);
    invariant(e.target.files);
    const [file] = Array.from(e.target.files);
    const userId = data()?.me?.id;
    const oldUrl = data()?.me?.avatarUrl;

    if (!file || !userId) {
      return;
    }

    setAvatarProcessing(true);

    const { createMultipartUpload: res } = await createAvatarUpload({
      targetId: userId,
      bytes: file.size,
      uploadMimeType: file.type,
      postProcess: UploadPostProcess.ProfileAvatar,
    });

    const upload = doMultipartUpload(file, res.urls, res.partSize);
    upload.onProgress((i) => console.log(i));

    const eTags = await upload;

    await finalizeUpload({
      targetId: userId,
      s3UploadKey: res.s3UploadKey,
      s3UploadId: res.s3UploadId,
      s3PartETags: eTags,
    });

    while (data()?.me?.avatarUrl === oldUrl) {
      await delay(1000);
      await refetchRouteData();
    }

    setAvatarProcessing(false);
  }

  // TODO: clear editing when submit succeeds

  return (
    <>
      <PageHeading title="My Profile" />
      <label
        class="flex items-center gap-3"
        classList={{ 'cursor-pointer': !avatarProcessing() }}
      >
        <Avatar src={data()?.me?.avatarUrl ?? ''} size="xl" />
        <input
          type="file"
          class="sr-only"
          onInput={handleAvatarInput}
          accept="image/png, image/jpeg"
          disabled={avatarProcessing()}
        />
        <Show when={avatarProcessing()}>
          <span>Processing...</span>
        </Show>
      </label>
      <submitProfile.Form class="mt-5 border-t border-gray-200">
        <input type="hidden" name="userId" value={data()?.me?.id ?? ''} />
        <EditableDatalist
          fields={fields}
          data={{
            username: data()?.me?.username ?? '',
            fullName: data()?.me?.fullName ?? '',
            email: data()?.me?.emails[0]?.email ?? '',
          }}
        />
      </submitProfile.Form>
    </>
  );
}
