import { refetchRouteData, RouteDataArgs, useRouteData } from 'solid-start';
import server$, {
  createServerAction$,
  createServerData$,
} from 'solid-start/server';
import invariant from 'tiny-invariant';
import { createSignal, Show } from 'solid-js';
import delay from 'delay';
import { gql } from 'graphql-request';
import type {
  CreateAvatarUploadMutation,
  CreateAvatarUploadMutationVariables,
  FinalizeAvatarUploadMutation,
  FinalizeAvatarUploadMutationVariables,
  ProfileChannelQuery,
  ProfileChannelQueryVariables,
  UpdateChannelMutation,
  UpdateChannelMutationVariables,
} from './__generated__/edit';
import { PageHeading } from '~/components/page-heading';
import { createAuthenticatedClientOrRedirect } from '~/util/gql/server';
import EditableDatalist, {
  DatalistField,
} from '~/components/editable-datalist';
import { UploadPostProcess } from '~/__generated__/graphql-types';
import { doMultipartUpload } from '~/util/multipart-upload';
import { Avatar } from '~/components/avatar';

export function routeData({ params, location }: RouteDataArgs<{ id: string }>) {
  return createServerData$(
    async ([, id], { request }) => {
      invariant(id, 'No id provided');
      const client = await createAuthenticatedClientOrRedirect(request);

      const { channelById } = await client.request<
        ProfileChannelQuery,
        ProfileChannelQueryVariables
      >(
        gql`
          query ProfileChannel($id: ShortUuid!) {
            channelById(id: $id) {
              id
              name
              avatarUrl
            }
          }
        `,
        {
          id,
        },
      );

      return channelById;
    },
    {
      key: () => [
        'channels',
        params['id'],
        location.query['after'],
        location.query['before'],
      ],
      reconcileOptions: {
        key: 'id',
      },
    },
  );
}

const fields: Array<DatalistField> = [
  {
    label: 'Channel Name',
    property: 'name',
    editable: true,
  },
];

export default function EditChannelRoute() {
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

  const [, submitChannel] = createServerAction$(
    async (form: FormData, { request }) => {
      const channelId = form.get('channelId');
      invariant(typeof channelId === 'string', 'Invalid channelId');
      const name = form.get('name');
      invariant(typeof name === 'string', 'Invalid name');

      const client = await createAuthenticatedClientOrRedirect(request);

      return client.request<
        UpdateChannelMutation,
        UpdateChannelMutationVariables
      >(
        gql`
          mutation UpdateChannel($channelId: ShortUuid!, $name: String!) {
            updateChannel(channelId: $channelId, name: $name) {
              id
            }
          }
        `,
        {
          channelId,
          name,
        },
      );
    },
  );

  const data = useRouteData<typeof routeData>();
  const [avatarProcessing, setAvatarProcessing] = createSignal(false);

  async function handleAvatarInput(e: InputEvent) {
    if (avatarProcessing()) {
      return;
    }

    invariant(e.target instanceof HTMLInputElement);
    invariant(e.target.files);
    const [file] = Array.from(e.target.files);
    const channelId = data()?.id;
    const oldUrl = data()?.avatarUrl;

    if (!file || !channelId) {
      return;
    }

    setAvatarProcessing(true);

    const { createMultipartUpload: res } = await createAvatarUpload({
      targetId: channelId,
      bytes: file.size,
      uploadMimeType: file.type,
      postProcess: UploadPostProcess.ChannelAvatar,
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

    while (data()?.avatarUrl === oldUrl) {
      await delay(2500);
      await refetchRouteData();
    }

    setAvatarProcessing(false);
  }

  return (
    <>
      <PageHeading title={`Edit Channel: ${data()?.name}`} backButton />
      <label
        class="flex items-center gap-3"
        classList={{ 'cursor-pointer': !avatarProcessing() }}
      >
        <Avatar src={data()?.avatarUrl ?? ''} size="xl" />
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
      <submitChannel.Form>
        <input type="hidden" name="channelId" value={data()?.id ?? ''} />
        <EditableDatalist fields={fields} data={data() ?? {}} />
      </submitChannel.Form>
    </>
  );
}
