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
import { json, useRouteData } from 'solid-start';
import Dropzone, { DroppedRes } from '~/components/dropzone';
import { createAuthenticatedClient, gql } from '~/util/gql/server';
import type { Channel } from '~/__generated__/graphql-types';
import * as Z from 'zod';
import type {
  ChannelsForUploadQuery,
  CreateMultipartMediaUploadMutation,
  CreateMultipartMediaUploadMutationVariables,
  FinalizeUploadMutation,
  FinalizeUploadMutationVariables,
  UpsertUploadRecordMutation,
  UpsertUploadRecordMutationVariables,
} from './__generated__/upload';
import {
  createServerAction$,
  createServerData$,
  redirect,
} from 'solid-start/server';
import { notEmpty } from '~/util';
import invariant from 'tiny-invariant';
import { doMultipartUpload } from '~/util/multipart-upload';

type BaseField = {
  label: string;
  name?: string;
  required?: boolean;
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
        },
        { label: 'Title', name: 'title', type: 'text', id: createUniqueId() },
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
          type: 'file',
          caption: 'Video or audio file (mp4, m4a, etc)',
          accept: 'video/*,audio/*',
          id: createUniqueId(),
          onDrop: onDropMedia,
        },
        {
          label: 'Thumbnail',
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

const CreateMultipartUploadSchema = Z.object({
  uploadRecordId: Z.string(),
  bytes: Z.preprocess(
    (s) => (typeof s === 'string' ? parseInt(s, 10) : s),
    Z.number(),
  ),
  uploadMimeType: Z.string(),
});

const FinalizeUploadSchema = Z.object({
  uploadRecordId: Z.string(),
  s3UploadKey: Z.string(),
  s3UploadId: Z.string(),
  s3PartETags: Z.array(Z.string()),
});

const CreateMultipartUploadResponseSchema = Z.object({
  createMultipartMediaUpload: Z.object({
    s3UploadKey: Z.string(),
    s3UploadId: Z.string(),
    partSize: Z.number(),
    urls: Z.array(Z.string()),
  }),
});

export function routeData() {
  return createServerData$(async (_, { request }) => {
    const client = await createAuthenticatedClient(request);

    const res = await client.request<ChannelsForUploadQuery>(gql`
      query ChannelsForUpload {
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
      }
    `);

    if (!res.me) {
      throw redirect('/');
    }

    return res;
  });
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
      const client = await createAuthenticatedClient(event.request);

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

  const [, createMultipartMediaUpload] = createServerAction$(
    async (form: FormData, event) => {
      const client = await createAuthenticatedClient(event.request);
      const variables = CreateMultipartUploadSchema.parse(
        Object.fromEntries(
          ['uploadRecordId', 'bytes', 'uploadMimeType'].map((p) => [
            p,
            form.get(p),
          ]),
        ),
      );

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

      return json(data);
    },
  );

  const [, finalizeUpload] = createServerAction$(
    async (form: FormData, event) => {
      const client = await createAuthenticatedClient(event.request);
      const variables = FinalizeUploadSchema.parse(
        Object.fromEntries([
          ...['uploadRecordId', 's3UploadKey', 's3UploadId'].map((p) => [
            p,
            form.get(p),
          ]),
          ['s3PartETags', form.getAll('s3PartETags')],
        ]),
      );

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

      return json(data);
    },
  );

  const [uploadRecordId, setUploadRecordId] = createSignal<string>();

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
      if (!uploadRecordId()) {
        await submitUpsert();
      }

      const createVariables = new FormData();
      const upRecId = uploadRecordId();
      invariant(upRecId, 'Missing uploadRecordId!');
      createVariables.set('uploadRecordId', upRecId);
      createVariables.set('uploadMimeType', mime);
      createVariables.set('bytes', `${file.size}`);

      const res = await createMultipartMediaUpload(createVariables);
      const {
        createMultipartMediaUpload: { urls, partSize, s3UploadKey, s3UploadId },
      } = CreateMultipartUploadResponseSchema.parse(await res.json());

      const upload = doMultipartUpload(file, urls, partSize);
      upload.onProgress((i) => setMediaUploadProgress(i));

      const eTags = await upload;

      const finalizeVariables = new FormData();
      finalizeVariables.set('uploadRecordId', upRecId);
      finalizeVariables.set('s3UploadKey', s3UploadKey);
      finalizeVariables.set('s3UploadId', s3UploadId);
      eTags.forEach((tag) => finalizeVariables.append('s3PartETags', tag));

      await finalizeUpload(finalizeVariables);
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
    ),
  );

  return (
    <upsert.Form onInput={onInput} ref={(f) => void (form = f)}>
      <Show when={uploadRecordId()} keyed>
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
                          <input
                            id={field.id}
                            {...(field.name ? { name: field.name } : {})}
                            type={field.type}
                            class="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                          />
                        }
                      >
                        <Match when={field.type === 'select'}>
                          <select
                            id={field.id}
                            {...(field.name ? { name: field.name } : {})}
                            class="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                          >
                            <For each={(field as SelectField).options}>
                              {(op) => (
                                <option
                                  value={op.value}
                                  disabled={op.disabled ?? false}
                                >
                                  {op.label}
                                </option>
                              )}
                            </For>
                          </select>
                        </Match>
                        <Match when={field.type === 'radio'}>
                          <fieldset>
                            <legend class="contents text-base font-medium text-gray-900">
                              {field.label}
                            </legend>
                            <div class="mt-4 space-y-4">
                              <For each={(field as RadioField).options}>
                                {(op) => (
                                  <div
                                    class={`flex ${
                                      op.help ? 'items-start' : 'items-center'
                                    }`}
                                  >
                                    <div class="flex h-5 items-center">
                                      <input
                                        id={`${field.id}_${op.value}`}
                                        {...(field.name
                                          ? { name: field.name }
                                          : {})}
                                        value={op.value}
                                        type="radio"
                                        class="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                    </div>
                                    <div class="ml-3 text-sm">
                                      <label
                                        for={`${field.id}_${op.value}`}
                                        class="font-medium text-gray-700"
                                      >
                                        {op.label}
                                      </label>
                                      <Show when={op.help}>
                                        <p class="text-gray-500">{op.help}</p>
                                      </Show>
                                    </div>
                                  </div>
                                )}
                              </For>
                            </div>
                          </fieldset>
                        </Match>
                        <Match when={field.type === 'file'}>
                          <Dropzone
                            progressLabel={`${field.label} upload progress`}
                            {...('tag' in field ? { tag: field.tag } : {})}
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
          <button
            type="submit"
            disabled={upserting.pending}
            class="ml-3 inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Save
          </button>
        </div>
      </div>
    </upsert.Form>
  );
}
