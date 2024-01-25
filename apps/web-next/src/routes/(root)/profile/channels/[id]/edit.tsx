import invariant from 'tiny-invariant';
import { createSignal, Show } from 'solid-js';
import delay from 'delay';
import { gql } from 'graphql-request';
import { getRequestEvent } from 'solid-js/web';
import {
  action,
  cache,
  createAsync,
  type RouteDefinition,
} from '@solidjs/router';
import type {
  CreateChannelFileUploadMutation,
  CreateChannelFileUploadMutationVariables,
  FinalizeAvatarUploadMutation,
  FinalizeAvatarUploadMutationVariables,
  ProfileChannelQuery,
  ProfileChannelQueryVariables,
  UpdateChannelMutation,
  UpdateChannelMutationVariables,
} from './__generated__/edit';
import { PageHeading } from '~/components/page-heading';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';
import EditableDatalist, {
  type DatalistField,
} from '~/components/editable-datalist';
import { UploadPostProcess } from '~/__generated__/graphql-types';
import { doMultipartUpload } from '~/util/multipart-upload';
import { Avatar } from '~/components/avatar';

const loadChannel = cache(
  async () => {
    'use server';
    const event = getRequestEvent();
    const url = new URL(event?.request.url ?? '');
    const id = url.searchParams.get('id');
    invariant(id, 'No id provided');

    const client = await getAuthenticatedClientOrRedirect();

    const { channelById } = await client.request<
      ProfileChannelQuery,
      ProfileChannelQueryVariables
    >(
      gql`
        query ProfileChannel($id: ShortUuid!) {
          channelById(id: $id) {
            id
            name
            avatarUrl(resize: { width: 96, height: 96 })
            defaultThumbnailUrl
          }
        }
      `,
      {
        id,
      },
    );

    return channelById;
  },
  'profileLoadChannel',
  {},
);

export const route: RouteDefinition = {
  load: () => loadChannel(),
};

const createFileUpload = async (
  variables: CreateChannelFileUploadMutationVariables,
) => {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();

  const data = await client.request<
    CreateChannelFileUploadMutation,
    CreateChannelFileUploadMutationVariables
  >(
    gql`
      mutation CreateChannelFileUpload(
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

const submitChannel = action(async (form: FormData) => {
  'use server';
  const channelId = form.get('channelId');
  invariant(typeof channelId === 'string', 'Invalid channelId');
  const name = form.get('name');
  invariant(typeof name === 'string', 'Invalid name');

  const client = await getAuthenticatedClientOrRedirect();

  return client.request<UpdateChannelMutation, UpdateChannelMutationVariables>(
    gql`
      mutation UpdateChannel($channelId: ShortUuid!, $name: String!) {
        upsertChannel(channelId: $channelId, name: $name) {
          id
        }
      }
    `,
    {
      channelId,
      name,
    },
  );
});

const fields: Array<DatalistField> = [
  {
    label: 'Channel Name',
    property: 'name',
    editable: true,
  },
];

export default function EditChannelRoute() {
  const data = createAsync(loadChannel);
  const [avatarProcessing, setAvatarProcessing] = createSignal(false);
  const [defaultThumbnailProcessing, setDefaultThumbnailProcessing] =
    createSignal(false);

  function checkIsProcessing(which: UploadPostProcess, oldUrl?: string | null) {
    if (which === UploadPostProcess.ChannelAvatar) {
      return data()?.avatarUrl === oldUrl;
    }

    if (which === UploadPostProcess.ChannelDefaultThumbnail) {
      return data()?.defaultThumbnailUrl === oldUrl;
    }

    return false;
  }

  async function handleImageInput(which: UploadPostProcess, e: InputEvent) {
    if (avatarProcessing()) {
      return;
    }

    invariant(e.target instanceof HTMLInputElement);
    invariant(e.target.files);
    const [file] = Array.from(e.target.files);
    const channelId = data()?.id;
    const oldUrl =
      which === UploadPostProcess.ChannelAvatar
        ? data()?.avatarUrl
        : which === UploadPostProcess.ChannelDefaultThumbnail
          ? data()?.defaultThumbnailUrl
          : null;

    if (!file || !channelId) {
      return;
    }

    if (which === UploadPostProcess.ChannelAvatar) {
      setAvatarProcessing(true);
    } else if (which === UploadPostProcess.ChannelDefaultThumbnail) {
      setDefaultThumbnailProcessing(true);
    }

    const { createMultipartUpload: res } = await createFileUpload({
      targetId: channelId,
      bytes: file.size,
      uploadMimeType: file.type,
      postProcess: which,
    });

    const upload = doMultipartUpload(file, res.urls, res.partSize);
    upload.onProgress((i) => console.log(i));

    const eTags = await upload;

    await finalizeUpload({
      targetId: channelId,
      s3UploadKey: res.s3UploadKey,
      s3UploadId: res.s3UploadId,
      s3PartETags: eTags,
    });

    while (checkIsProcessing(which, oldUrl)) {
      await delay(2500);
      await loadChannel();
    }

    if (which === UploadPostProcess.ChannelAvatar) {
      setAvatarProcessing(false);
    } else if (which === UploadPostProcess.ChannelDefaultThumbnail) {
      setDefaultThumbnailProcessing(false);
    }
  }

  return (
    <>
      <PageHeading title={`Edit Channel: ${data()?.name}`} backButton />
      <form action={submitChannel} method="post">
        <input type="hidden" name="channelId" value={data()?.id ?? ''} />
        <EditableDatalist fields={fields} data={data() ?? {}} />
      </form>
      <div class="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5">
        <dt class="flex h-full items-center text-sm font-medium text-gray-500">
          Avatar
        </dt>
        <dd class="mt-1 flex text-sm text-gray-900 sm:col-span-2 sm:mt-0">
          <label
            class="flex items-center gap-3"
            classList={{ 'cursor-pointer': !avatarProcessing() }}
          >
            <Avatar src={data()?.avatarUrl ?? ''} size="xl" />
            <input
              type="file"
              class="sr-only"
              onInput={[handleImageInput, UploadPostProcess.ChannelAvatar]}
              accept="image/png, image/jpeg"
              disabled={avatarProcessing()}
            />
            <Show when={avatarProcessing()}>
              <span>Processing...</span>
            </Show>
          </label>
        </dd>
        <dt class="flex h-full items-center text-sm font-medium text-gray-500">
          Default Thumbnail
        </dt>
        <dd class="mt-1 flex text-sm text-gray-900 sm:col-span-2 sm:mt-0">
          <label
            class="flex items-center gap-3"
            classList={{ 'cursor-pointer': !avatarProcessing() }}
          >
            <img
              src={
                data()?.defaultThumbnailUrl ??
                'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
              }
              class="aspect-video w-[300px] bg-gray-200 text-transparent"
            />
            <input
              type="file"
              class="sr-only"
              onInput={[
                handleImageInput,
                UploadPostProcess.ChannelDefaultThumbnail,
              ]}
              accept="image/png, image/jpeg"
              disabled={defaultThumbnailProcessing()}
            />
            <Show when={defaultThumbnailProcessing()}>
              <span>Processing...</span>
            </Show>
          </label>
        </dd>
      </div>
    </>
  );
}
