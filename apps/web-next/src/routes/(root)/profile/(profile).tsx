import { createSignal, Show } from 'solid-js';
import invariant from 'tiny-invariant';
import delay from 'delay';
import { gql } from 'graphql-request';
import {
  action,
  cache,
  createAsync,
  type RouteDefinition,
} from '@solidjs/router';
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
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';
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

const loadData = cache(async () => {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();
  return await client.request<
    ProfilePageDataQuery,
    ProfilePageDataQueryVariables
  >(gql`
    query ProfilePageData {
      me {
        id
        username
        fullName
        avatarUrl(resize: { width: 96, height: 96 })
        emails {
          email
        }
      }
    }
  `);
}, 'profile');

export const route = {
  load: () => {
    void loadData();
  },
} satisfies RouteDefinition;

const createAvatarUpload = async (
  variables: CreateAvatarUploadMutationVariables,
) => {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();

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
};

const finalizeUpload = async (
  variables: FinalizeAvatarUploadMutationVariables,
) => {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();

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
};

const submitProfile = action(async (form: FormData) => {
  'use server';
  const userId = form.get('userId');
  invariant(typeof userId === 'string', 'Invalid userId');
  const fullName = form.get('fullName');
  invariant(typeof fullName === 'string', 'Invalid fullName');
  const email = form.get('email');
  invariant(typeof email === 'string', 'Invalid email');

  const client = await getAuthenticatedClientOrRedirect();

  return client.request<UpdateUserMutation, UpdateUserMutationVariables>(
    gql`
      mutation UpdateUser(
        $userId: ShortUuid!
        $fullName: String!
        $email: String!
      ) {
        upsertUser(userId: $userId, fullName: $fullName, email: $email) {
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
});

export default function ProfileRoute() {
  const data = createAsync(() => loadData());
  const [avatarProcessing, setAvatarProcessing] = createSignal(false);

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
      loadData();
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
      <form
        action={submitProfile}
        method="post"
        class="mt-5 border-t border-gray-200"
      >
        <input type="hidden" name="userId" value={data()?.me?.id ?? ''} />
        <EditableDatalist
          fields={fields}
          data={{
            username: data()?.me?.username ?? '',
            fullName: data()?.me?.fullName ?? '',
            email: data()?.me?.emails[0]?.email ?? '',
          }}
        />
      </form>
    </>
  );
}
