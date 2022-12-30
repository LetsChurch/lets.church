import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  Show,
  Switch,
} from 'solid-js';
import { debounce } from '@solid-primitives/scheduled';
import { json, RouteDataArgs, useRouteData } from 'solid-start';
import Dropzone, { DroppedRes } from '~/components/dropzone';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';
import type { Channel } from '~/__generated__/graphql-types';
import * as Z from 'zod';
import type {
  UploadRouteDataQuery,
  CreateMultipartMediaUploadMutation,
  CreateMultipartMediaUploadMutationVariables,
  FinalizeUploadMutation,
  FinalizeUploadMutationVariables,
  UpsertUploadRecordMutation,
  UpsertUploadRecordMutationVariables,
  UploadRouteDataQueryVariables,
} from './__generated__/upload';
import server$, {
  createServerAction$,
  createServerData$,
  redirect,
} from 'solid-start/server';
import { notEmpty } from '~/util';
import invariant from 'tiny-invariant';
import { doMultipartUpload } from '~/util/multipart-upload';
import { Input, Select, Button, Radios } from '~/components/form';

type BaseField = {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string | undefined | null;
  id: string;
};

type TextField = BaseField & {
  type: 'text';
};

type FileField = BaseField & {
  type: 'file';
  caption?: string;
  accept?: string;
  onDrop: (file: File, mime: string) => DroppedRes;
};

type SelectField = BaseField & {
  type: 'select';
  options: Array<{ label: string; value: string; disabled?: boolean }>;
};

type RadioField = BaseField & {
  type: 'radio';
  options: Array<{ label: string; help?: string; value: string }>;
};

type Field = TextField | FileField | SelectField | RadioField;

type Section = { title: string; help?: string; fields: Array<Field> };

function getSections(
  channels: Array<Pick<Channel, 'id' | 'name'>> = [],
  onDropMedia: FileField['onDrop'],
  onDropThumbnail: FileField['onDrop'],
  // TODO: felte
  defaultValues: {
    channelId: string | null | undefined;
    title: string | null | undefined;
  },
): Array<Section> {
  return [
    {
      title: 'Metadata',
      help: 'asdf',
      fields: [
        {
          label: 'Channel',
          name: 'channelId',
          type: 'select',
          options: channels.map(({ id, name }) => ({ label: name, value: id })),
          id: createUniqueId(),
          defaultValue: defaultValues.channelId,
        },
        {
          label: 'Title',
          name: 'title',
          type: 'text',
          id: createUniqueId(),
          defaultValue: defaultValues.title,
        },
        {
          label: 'License',
          name: 'license',
          type: 'select',
          options: [
            { label: 'Standard Copyright', value: 'standard' },
            { label: 'Public Domain', value: 'public-domain' },
            { label: 'Creative Commons', value: '', disabled: true },
            { label: 'CC BY', value: 'cc-by' },
            { label: 'CC BY-SA', value: 'cc-by-sa' },
            { label: 'CC BY-NC', value: 'cc-by-nc' },
            { label: 'CC BY-NC-SA', value: 'cc-by-nc-sa' },
            { label: 'CC BY-ND', value: 'cc-by-nd' },
            { label: 'CC BY-NC-ND', value: 'cc-by-nc-nd' },
            { label: 'CC0', value: 'cc0' },
          ],
          id: createUniqueId(),
        },
      ],
    },
    {
      title: 'Upload',
      help: 'asdf',
      fields: [
        {
          label: 'Media',
          name: 'Media',
          type: 'file',
          caption: 'Video or audio file (mp4, m4a, etc)',
          accept: 'video/*,audio/*',
          id: createUniqueId(),
          onDrop: onDropMedia,
        },
        {
          label: 'Thumbnail',
          name: 'Thumbnail',
          type: 'file',
          caption: 'Optional image file (png recommended)',
          accept: 'image/*',
          id: createUniqueId(),
          onDrop: onDropThumbnail,
        },
      ],
    },
    {
      title: 'Settings',
      help: 'asdf',
      fields: [
        {
          type: 'radio',
          label: 'Visiblity',
          name: 'visiblity',
          options: [
            { label: 'Public', help: 'Visible to everyone', value: 'public' },
            {
              label: 'Private',
              help: 'Visible only to members of <channel>',
              value: 'private',
            },
            {
              label: 'Unlisted',
              help: 'Visible everyone with a link',
              value: 'unlisted',
            },
          ],
          id: createUniqueId(),
        },
      ],
    },
  ];
}

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    async ([id = null], { request }) => {
      const client = await createAuthenticatedClientOrRedirect(request);

      const res = await client.request<
        UploadRouteDataQuery,
        UploadRouteDataQueryVariables
      >(
        gql`
          query UploadRouteData($id: ShortUuid = "", $prefetch: Boolean!) {
            me {
              channelMembershipsConnection(canUpload: true) {
                edges {
                  node {
                    channel {
                      id
                      name
                    }
                  }
                }
              }
            }
            uploadRecordById(id: $id) @include(if: $prefetch) {
              canMutate
              id
              title
              channel {
                id
              }
            }
          }
        `,
        { id, prefetch: Boolean(id) },
      );

      // If we aren't logged in or otherwise can't mutate a given record, redirect
      if (!res.me || (id && !res.uploadRecordById?.canMutate)) {
        throw redirect('/');
      }

      return res;
    },
    { key: () => [location.query['id']] },
  );
}

const UpsertUploadRecordSchema = Z.object({
  uploadRecordId: Z.string().optional().nullable().default(null),
  title: Z.string().optional().nullable().default(null),
  description: Z.string().optional().nullable().default(null),
  channelId: Z.string(),
});

export default function UploadRoute() {
  const data = useRouteData<typeof routeData>();

  const [upserting, upsert] = createServerAction$(
    async (form: FormData, event) => {
      const client = await createAuthenticatedClientOrRedirect(event.request);

      const variables = UpsertUploadRecordSchema.parse(
        Object.fromEntries(
          ['uploadRecordId', 'title', 'description', 'channelId'].map((p) => [
            p,
            form.get(p),
          ]),
        ),
      );

      const data = await client.request<
        UpsertUploadRecordMutation,
        UpsertUploadRecordMutationVariables
      >(
        gql`
          mutation UpsertUploadRecord(
            $uploadRecordId: ShortUuid
            $title: String
            $description: String
            $channelId: ShortUuid!
          ) {
            upsertUploadRecord(
              uploadRecordId: $uploadRecordId
              title: $title
              description: $description
              channelId: $channelId
            ) {
              id
            }
          }
        `,
        variables,
      );

      return json(data);
    },
  );

  const createMultipartMediaUpload = server$(
    async (variables: CreateMultipartMediaUploadMutationVariables) => {
      const client = await createAuthenticatedClientOrRedirect(server$.request);

      const data = await client.request<
        CreateMultipartMediaUploadMutation,
        CreateMultipartMediaUploadMutationVariables
      >(
        gql`
          mutation CreateMultipartMediaUpload(
            $uploadRecordId: ShortUuid!
            $bytes: SafeInt!
            $uploadMimeType: String!
          ) {
            createMultipartMediaUpload(
              uploadRecordId: $uploadRecordId
              bytes: $bytes
              uploadMimeType: $uploadMimeType
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
    async (variables: FinalizeUploadMutationVariables) => {
      const client = await createAuthenticatedClientOrRedirect(server$.request);

      const data = await client.request<
        FinalizeUploadMutation,
        FinalizeUploadMutationVariables
      >(
        gql`
          mutation FinalizeUpload(
            $uploadRecordId: ShortUuid!
            $s3UploadKey: String!
            $s3UploadId: String!
            $s3PartETags: [String!]!
          ) {
            finalizeUpload(
              uploadRecordId: $uploadRecordId
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

  const [uploadRecordId, setUploadRecordId] = createSignal<string>();
  const resolvedId = () => data()?.uploadRecordById?.id ?? uploadRecordId();

  let form: HTMLFormElement;

  async function submitUpsert() {
    const res = await upsert(new FormData(form));
    const data = await res.json();
    setUploadRecordId(data.upsertUploadRecord.id);
  }

  const onInput = debounce(() => {
    submitUpsert();
  }, 200);

  function onDropMedia(file: File, mime: string) {
    const [uploadProgress, setMediaUploadProgress] = createSignal(0);

    (async () => {
      if (!resolvedId()) {
        await submitUpsert();
      }

      const upRecId = uploadRecordId();
      invariant(upRecId);

      const { createMultipartMediaUpload: res } =
        await createMultipartMediaUpload({
          uploadRecordId: upRecId,
          bytes: file.size,
          uploadMimeType: mime,
        });

      const upload = doMultipartUpload(file, res.urls, res.partSize);
      upload.onProgress((i) => setMediaUploadProgress(i));

      const eTags = await upload;

      await finalizeUpload({
        uploadRecordId: upRecId,
        s3UploadKey: res.s3UploadKey,
        s3UploadId: res.s3UploadId,
        s3PartETags: eTags,
      });
    })();

    return { title: file.name, progress: uploadProgress };
  }

  const sections = createMemo(() =>
    getSections(
      data()
        ?.me?.channelMembershipsConnection.edges.map((e) => e?.node.channel)
        .filter(notEmpty),
      onDropMedia,
      (file: File) => {
        const [progress] = createSignal(0.5);
        return { title: file.name, progress };
      },
      {
        channelId: data()?.uploadRecordById?.channel.id,
        title: data()?.uploadRecordById?.title,
      },
    ),
  );

  return (
    <upsert.Form onInput={onInput} ref={(f) => void (form = f)}>
      <Show when={resolvedId()} keyed>
        {(value) => <input type="hidden" name="uploadRecordId" value={value} />}
      </Show>
      <For each={sections()}>
        {(section, si) => (
          <>
            <section class="md:grid md:grid-cols-3 md:gap-6">
              <div class="md:col-span-1">
                <h3 class="text-lg font-medium leading-6 text-gray-900">
                  {section.title}
                </h3>
                <Show when={section.help}>
                  <p class="mt-1 text-sm text-gray-600">{section.help}</p>
                </Show>
              </div>
              <div class="md:col-span-2">
                <For each={section.fields}>
                  {(field, fieldI) => (
                    <div class:mt-5={fieldI() > 0}>
                      <Show when={field.type !== 'radio'}>
                        <label
                          class="block text-sm font-medium text-gray-700"
                          for={field.id}
                        >
                          {field.label}
                        </label>
                      </Show>
                      <Switch
                        fallback={
                          <Input
                            id={field.id}
                            name={field.name}
                            {...(field.defaultValue
                              ? { value: field.defaultValue }
                              : {})}
                            type={field.type}
                          />
                        }
                      >
                        <Match when={field.type === 'select'}>
                          <Select
                            id={field.id}
                            name={field.name}
                            options={(field as SelectField).options}
                            {...(field.defaultValue
                              ? { value: field.defaultValue }
                              : {})}
                          />
                        </Match>
                        <Match when={field.type === 'radio'}>
                          <Radios
                            label={field.label}
                            id={field.id}
                            name={field.name}
                            options={(field as RadioField).options}
                            {...(field.defaultValue
                              ? { value: field.defaultValue }
                              : {})}
                          />
                        </Match>
                        <Match when={field.type === 'file'}>
                          <Dropzone
                            progressLabel={`${field.label} upload progress`}
                            {...('caption' in field
                              ? { caption: field.caption }
                              : {})}
                            {...('accept' in field
                              ? { accept: field.accept }
                              : {})}
                            onDrop={(field as FileField).onDrop}
                          />
                        </Match>
                      </Switch>
                    </div>
                  )}
                </For>
              </div>
            </section>
            <Show when={si() < sections().length - 1}>
              <hr class="my-10 border-t border-gray-200" />
            </Show>
          </>
        )}
      </For>
      <div class="pt-5">
        <div class="flex justify-end">
          <Button type="submit" disabled={upserting.pending}>
            Save
          </Button>
        </div>
      </div>
    </upsert.Form>
  );
}
