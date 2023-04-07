import { type JSX, For, createSignal, Show } from 'solid-js';
import PencilIcon from '@tabler/icons/pencil.svg?component-solid';
import { autofocus } from '@solid-primitives/autofocus';
import server$, {
  createServerAction$,
  createServerData$,
} from 'solid-start/server';
import { refetchRouteData, useRouteData } from 'solid-start';
import invariant from 'tiny-invariant';
import delay from 'delay';
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
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';
import { PageHeading } from '~/components/page-heading';
import { UploadPostProcess } from '~/__generated__/graphql-types';
import { doMultipartUpload } from '~/util/multipart-upload';
import { Avatar } from '~/components/avatar';

type Field = {
  label: string;
  property: string;
  editable: boolean;
  type?: JSX.IntrinsicElements['input']['type'];
};

const fields: Array<Field> = [
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

type ProfileRowProps = {
  field: Field;
  value: string;
  editing: string | null;
  setEditing: (editing: string | null) => void;
};

function ProfileRow(props: ProfileRowProps) {
  return (
    <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
      <dt class="flex h-full items-center text-sm font-medium text-gray-500">
        {props.field.label}
      </dt>
      <dd class="mt-1 flex text-sm text-gray-900 sm:col-span-2 sm:mt-0">
        <div class="flex flex-grow items-center">
          <Show
            when={props.field.property === props.editing}
            fallback={
              <>
                <span class="flex h-[36px] items-center">{props.value}</span>
                <Show when={props.field.editable}>
                  <input
                    type="hidden"
                    name={props.field.property}
                    value={props.value}
                  />
                </Show>
              </>
            }
          >
            <input
              type={props.field.type ?? 'text'}
              name={props.field.property}
              class="block h-full w-[90%] rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              autofocus
              ref={(el) => autofocus(el)}
            />
          </Show>
        </div>
        <Show when={props.field.editable}>
          <div class="ml-4 flex-shrink-0">
            <Show
              when={props.field.property === props.editing}
              fallback={
                <button
                  type="button"
                  class="flex h-full items-center rounded-md bg-white font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  onClick={() => props.setEditing(props.field.property)}
                >
                  <PencilIcon />
                </button>
              }
            >
              <button
                type="submit"
                class="flex h-full items-center rounded-md bg-white font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Save
              </button>
            </Show>
          </div>
        </Show>
      </dd>
    </div>
  );
}

export function routeData() {
  const data = createServerData$(async (_, { request }) => {
    const client = await createAuthenticatedClientOrRedirect(request);
    return await client.request<
      ProfilePageDataQuery,
      ProfilePageDataQueryVariables
    >(
      gql`
        query ProfilePageData {
          me {
            id
            username
            fullName
            email
            avatarUrl
          }
        }
      `,
    );
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
  const [editing, setEditing] = createSignal<string | null>(null);
  const [avatarProcessing, setAvatarProcessing] = createSignal(false);

  const [, submitSubscribe] = createServerAction$(
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
      await delay(2500);
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
      <submitSubscribe.Form class="mt-5 border-t border-gray-200">
        <input type="hidden" name="userId" value={data()?.me?.id ?? ''} />
        <dl class="divide-y divide-gray-200">
          <For each={fields}>
            {(field) => (
              <ProfileRow
                field={field}
                editing={editing()}
                setEditing={setEditing}
                value={
                  data()?.me?.[field.property as 'fullName' | 'email'] ?? ''
                }
              />
            )}
          </For>
        </dl>
      </submitSubscribe.Form>
    </>
  );
}
