import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  Show,
  Switch,
} from 'solid-js';
import { z } from 'zod';
import invariant from 'tiny-invariant';
import { gql } from 'graphql-request';
import {
  cache,
  redirect,
  createAsync,
  action,
  useSubmission,
  type RouteDefinition,
  useLocation,
  useAction,
} from '@solidjs/router';
import type {
  UploadRouteDataQuery,
  CreateMultipartMediaUploadMutation,
  CreateMultipartMediaUploadMutationVariables,
  UpsertUploadRecordMutation,
  UpsertUploadRecordMutationVariables,
  UploadRouteDataQueryVariables,
  FinalizeMediaUploadMutationVariables,
  FinalizeMediaUploadMutation,
} from './__generated__/upload';
import Dropzone, { type DroppedRes } from '~/components/dropzone';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';
import {
  UploadLicense,
  UploadPostProcess,
  UploadVisibility,
  type Channel,
} from '~/__generated__/graphql-types';
import { notEmpty, type Optional } from '~/util';
import { doMultipartUpload } from '~/util/multipart-upload';
import { Input, Select, Button, Radios, Textarea } from '~/components/form';
import { dateToIso8601 } from '~/util/date';

type BaseField = {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: Optional<string>;
  id: string;
  disabled?: boolean;
};

type TextField = BaseField & {
  type: 'text';
  rows?: number;
};

type DateField = BaseField & {
  type: 'date';
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

type Field = TextField | DateField | FileField | SelectField | RadioField;

type Section = { title: string; help?: string; fields: Array<Field> };

function getSections(
  channels: Array<Pick<Channel, 'id' | 'name'>> = [],
  onDropMedia: FileField['onDrop'],
  onDropThumbnail: FileField['onDrop'],
  defaultValues: {
    channelId: Optional<string>;
    title: Optional<string>;
    description: Optional<string>;
    publishedAt: Optional<string>;
    license: Optional<string>;
    visibility: Optional<string>;
    uploadFinalized: boolean;
    userCommentsEnabled: boolean;
    downloadsEnabled: boolean;
  },
): Array<Section> {
  return [
    {
      title: 'Metadata',
      /* help: 'asdf', */
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
          label: 'Description',
          name: 'description',
          type: 'text',
          rows: 5,
          id: createUniqueId(),
          defaultValue: defaultValues.description,
        },
        {
          label: 'License',
          name: 'license',
          type: 'select',
          defaultValue: defaultValues.license,
          options: [
            { label: 'Standard Copyright', value: 'STANDARD' },
            { label: 'Public Domain', value: 'PUBLIC_DOMAIN' },
            { label: 'Creative Commons', value: '', disabled: true },
            { label: 'CC BY', value: 'CC_BY' },
            { label: 'CC BY-SA', value: 'CC_BY_SA' },
            { label: 'CC BY-NC', value: 'CC_BY_NC' },
            { label: 'CC BY-NC-SA', value: 'CC_BY_NC_SA' },
            { label: 'CC BY-ND', value: 'CC_BY_ND' },
            { label: 'CC BY-NC-ND', value: 'CC_BY_NC_ND' },
            { label: 'CC0', value: 'CC0' },
          ],
          id: createUniqueId(),
        },
        {
          label: 'Publish Date',
          name: 'publishedAt',
          type: 'date',
          id: createUniqueId(),
          defaultValue: defaultValues.publishedAt,
        },
      ],
    },
    {
      title: 'Upload',
      /* help: 'asdf', */
      fields: [
        {
          label: 'Media',
          name: 'Media',
          type: 'file',
          caption: 'Video or audio file (mp4, m4a, etc)',
          accept: 'video/*,audio/*',
          id: createUniqueId(),
          onDrop: onDropMedia,
          disabled: defaultValues.uploadFinalized,
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
      /* help: 'asdf', */
      fields: [
        {
          type: 'radio',
          label: 'Visibility',
          name: 'visibility',
          defaultValue: defaultValues.visibility,
          options: [
            { label: 'Public', help: 'Visible to everyone', value: 'PUBLIC' },
            {
              label: 'Private',
              help: 'Visible only to members of <channel>',
              value: 'PRIVATE',
            },
            {
              label: 'Unlisted',
              help: 'Visible everyone with a link',
              value: 'UNLISTED',
            },
          ],
          id: createUniqueId(),
        },
        {
          type: 'radio',
          label: 'Comments',
          name: 'userCommentsEnabled',
          defaultValue: defaultValues.userCommentsEnabled
            ? 'ENABLED'
            : 'DISABLED',
          options: [
            {
              label: 'Enabled',
              help: 'Users can comment on this upload.',
              value: 'ENABLED',
            },
            {
              label: 'Disabled',
              help: 'Users cannot comment on this upload.',
              value: 'DISABLED',
            },
          ],
          id: createUniqueId(),
        },
        {
          type: 'radio',
          label: 'Downloads',
          name: 'downloadsEnabled',
          defaultValue: defaultValues.downloadsEnabled ? 'ENABLED' : 'DISABLED',
          options: [
            {
              label: 'Enabled',
              help: 'Users can download this media.',
              value: 'ENABLED',
            },
            {
              label: 'Disabled',
              help: 'Users cannot download this media.',
              value: 'DISABLED',
            },
          ],
          id: createUniqueId(),
        },
      ],
    },
  ];
}

const routeData = cache(async (id: string | null) => {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();
  const res = await client.request<
    UploadRouteDataQuery,
    UploadRouteDataQueryVariables
  >(
    gql`
      query UploadRouteData($id: ShortUuid = "", $prefetch: Boolean!) {
        me {
          canUpload
          channelMembershipsConnection(canUpload: true, first: 100) {
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
          description
          publishedAt
          license
          visibility
          userCommentsEnabled
          downloadsEnabled
          uploadFinalized
          channel {
            id
          }
        }
      }
    `,
    { id, prefetch: Boolean(id) },
  );

  // If we aren't logged in or otherwise can't mutate a given record, or if we can't upload at all, redirect
  if (
    !res.me ||
    (id && !res.uploadRecordById?.canMutate) ||
    !res.me.canUpload
  ) {
    throw redirect('/');
  }

  return res;
}, 'upload');

export const route = {
  load: ({ location }) => {
    void routeData(location.query['id'] ?? null);
  },
} satisfies RouteDefinition;

const UpsertUploadRecordSchema = z.object({
  uploadRecordId: z.string().optional().nullable().default(null),
  title: z.string().optional().nullable().default(null),
  description: z.string().optional().nullable().default(null),
  publishedAt: z.preprocess(
    (arg) => (typeof arg === 'string' ? new Date(arg).toISOString() : arg),
    z.string(),
  ),
  license: z.nativeEnum(UploadLicense),
  visibility: z.nativeEnum(UploadVisibility),
  userCommentsEnabled: z.preprocess((s) => s === 'ENABLED', z.boolean()),
  downloadsEnabled: z.preprocess((s) => s === 'ENABLED', z.boolean()),
  channelId: z.string(),
});

const upsert = action(async (form: FormData) => {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();

  const variables = UpsertUploadRecordSchema.parse(
    Object.fromEntries(
      [
        'uploadRecordId',
        'title',
        'description',
        'publishedAt',
        'license',
        'visibility',
        'userCommentsEnabled',
        'downloadsEnabled',
        'channelId',
      ].map((p) => [p, form.get(p)]),
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
        $publishedAt: DateTime!
        $license: UploadLicense!
        $visibility: UploadVisibility!
        $userCommentsEnabled: Boolean!
        $downloadsEnabled: Boolean!
        $channelId: ShortUuid!
      ) {
        upsertUploadRecord(
          uploadRecordId: $uploadRecordId
          title: $title
          description: $description
          publishedAt: $publishedAt
          license: $license
          visibility: $visibility
          userCommentsEnabled: $userCommentsEnabled
          downloadsEnabled: $downloadsEnabled
          channelId: $channelId
        ) {
          id
        }
      }
    `,
    variables,
  );

  return data;
});

async function createMultipartUpload(
  variables: CreateMultipartMediaUploadMutationVariables,
) {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();

  const data = await client.request<
    CreateMultipartMediaUploadMutation,
    CreateMultipartMediaUploadMutationVariables
  >(
    gql`
      mutation CreateMultipartMediaUpload(
        $uploadRecordId: ShortUuid!
        $bytes: SafeInt!
        $uploadMimeType: String!
        $postProcess: UploadPostProcess!
      ) {
        createMultipartUpload(
          targetId: $uploadRecordId
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
}

async function finalizeUpload(variables: FinalizeMediaUploadMutationVariables) {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();

  const data = await client.request<
    FinalizeMediaUploadMutation,
    FinalizeMediaUploadMutationVariables
  >(
    gql`
      mutation FinalizeMediaUpload(
        $uploadRecordId: ShortUuid!
        $s3UploadKey: String!
        $s3UploadId: String!
        $s3PartETags: [String!]!
      ) {
        finalizeMultipartUpload(
          targetId: $uploadRecordId
          s3UploadKey: $s3UploadKey
          s3UploadId: $s3UploadId
          s3PartETags: $s3PartETags
        )
      }
    `,
    variables,
  );

  return data;
}

export default function UploadRoute() {
  const location = useLocation();
  const data = createAsync(() => routeData(location.query['id'] ?? null));
  const upsertAction = useAction(upsert);
  const upsertSubmission = useSubmission(upsert);

  const [uploadRecordId, setUploadRecordId] = createSignal<string>();
  const resolvedId = () => data()?.uploadRecordById?.id ?? uploadRecordId();

  let formRef: HTMLFormElement;

  async function submitUpsert() {
    const res = await upsertAction(new FormData(formRef));
    setUploadRecordId(res.upsertUploadRecord.id);
  }

  function onDropFile(
    file: File,
    mime: string,
    postProcess: UploadPostProcess,
  ) {
    const [uploadProgress, setMediaUploadProgress] = createSignal(0);

    (async () => {
      if (!resolvedId()) {
        await submitUpsert();
      }

      const uploadRecordId = resolvedId();
      invariant(uploadRecordId);

      const { createMultipartUpload: res } = await createMultipartUpload({
        uploadRecordId: uploadRecordId,
        bytes: file.size,
        uploadMimeType: mime,
        postProcess,
      });

      const upload = doMultipartUpload(file, res.urls, res.partSize);
      upload.onProgress((i) => setMediaUploadProgress(i));

      const eTags = await upload;

      await finalizeUpload({
        uploadRecordId: uploadRecordId,
        s3UploadKey: res.s3UploadKey,
        s3UploadId: res.s3UploadId,
        s3PartETags: eTags,
      });
    })();

    return { title: file.name, progress: uploadProgress };
  }

  function onDropMedia(file: File, mime: string) {
    return onDropFile(file, mime, UploadPostProcess.Media);
  }

  function onDropThumbnail(file: File, mime: string) {
    return onDropFile(file, mime, UploadPostProcess.Thumbnail);
  }

  const sections = createMemo(() => {
    const d = data();
    const publishedAt = d?.uploadRecordById?.publishedAt;

    return getSections(
      d?.me?.channelMembershipsConnection.edges
        .map((e) => e?.node.channel)
        .filter(notEmpty),
      onDropMedia,
      onDropThumbnail,
      {
        channelId: d?.uploadRecordById?.channel.id,
        title: d?.uploadRecordById?.title,
        description: d?.uploadRecordById?.description,
        publishedAt: dateToIso8601(
          publishedAt ? new Date(publishedAt) : new Date(),
        ),
        license: d?.uploadRecordById?.license,
        visibility: d?.uploadRecordById?.visibility ?? 'PUBLIC',
        uploadFinalized: d?.uploadRecordById?.uploadFinalized ?? false,
        userCommentsEnabled: d?.uploadRecordById?.userCommentsEnabled ?? true,
        downloadsEnabled: d?.uploadRecordById?.downloadsEnabled ?? true,
      },
    );
  });

  return (
    <form ref={formRef!}>
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
                            disabled={field.disabled ?? false}
                            class="mt-1"
                            onBlur={submitUpsert}
                          />
                        }
                      >
                        <Match
                          when={
                            field.type === 'text' &&
                            typeof field.rows === 'number' &&
                            field
                          }
                          keyed
                        >
                          {(textAreaField) => (
                            <Textarea
                              id={field.id}
                              name={field.name}
                              {...(field.defaultValue
                                ? { value: field.defaultValue }
                                : {})}
                              rows={textAreaField.rows ?? ''}
                              disabled={field.disabled ?? false}
                              class="mt-1"
                              onBlur={submitUpsert}
                            />
                          )}
                        </Match>
                        <Match when={field.type === 'select' && field} keyed>
                          {(selectField) => (
                            <Select
                              id={field.id}
                              name={field.name}
                              options={(field as SelectField).options}
                              value={selectField.defaultValue ?? ''}
                              disabled={field.disabled ?? false}
                              class="mt-1"
                              onBlur={submitUpsert}
                            />
                          )}
                        </Match>
                        <Match when={field.type === 'radio' && field} keyed>
                          {(radioField) => (
                            <Radios
                              label={field.label}
                              id={field.id}
                              name={field.name}
                              options={radioField.options}
                              value={radioField.defaultValue}
                              disabled={field.disabled ?? false}
                              onClick={submitUpsert}
                            />
                          )}
                        </Match>
                        <Match when={field.type === 'file' && field} keyed>
                          {(fileField) => (
                            <Dropzone
                              progressLabel={`${field.label} upload progress`}
                              caption={fileField.caption}
                              accept={fileField.accept}
                              onDrop={(field as FileField).onDrop}
                              disabled={field.disabled ?? false}
                            />
                          )}
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
          <Button type="submit" disabled={upsertSubmission.pending}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
