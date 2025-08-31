import {
  ActionIcon,
  Box,
  Button,
  Container,
  Grid,
  Group,
  Image,
  LoadingOverlay,
  Progress,
  Radio,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useStore } from '@nanostores/react';
import { UploadLicense, UploadVisibility } from '@prisma/client';
import { IconPhoto, IconUpload, IconX } from '@tabler/icons-react';
import type { Query } from '@tanstack/query-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import { useState } from 'react';
import { z } from 'zod';
import { useAppMantineForm } from '@/components/mantine';
import db from '@/util/db';
import { doMultipartUpload } from '@/util/multipart-upload';
import {
  clientCreateMultipartUpload,
  clientFinalizeMultipartUpload,
  hasValidSession,
  requireChannelUploadAccessMiddleware,
  requireChannelUploadEditAccessMiddleware,
} from '../-functions';
import { showFailure, showSuccess } from '../-mantine';
import { dashboardQueryKeys } from './-query-keys';
import { $uploadProgress } from './channels_.$channelId_.uploads';

const getUploadRecord = createServerFn({ method: 'GET' })
  .middleware([requireChannelUploadAccessMiddleware])
  .validator(
    z.object({
      channelId: z.string(),
      uploadId: z.string(),
    }),
  )
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    const upload = await db.uploadRecord.findFirst({
      select: {
        id: true,
        title: true,
        description: true,
        license: true,
        visibility: true,
        publishedAt: true,
        userCommentsEnabled: true,
        downloadsEnabled: true,
        defaultThumbnailPath: true,
        overrideThumbnailPath: true,
        transcodingFinishedAt: true,
        transcribingFinishedAt: true,
        transcodingProgress: true,
        channel: {
          select: {
            id: true,
            name: true,
            memberships: {
              select: {
                isAdmin: true,
                canEdit: true,
                appUser: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
      where: {
        id: data.uploadId,
        channelId: data.channelId,
        channel: {
          memberships: {
            some: {
              appUserId: context.session.appUser.id,
            },
          },
        },
      },
    });

    if (!upload) {
      throw new Error('Upload not found or access denied');
    }

    const userMembership = upload.channel.memberships.find(
      (m) => m.appUser.id === context.session?.appUser.id,
    );

    const canEdit = userMembership?.isAdmin || userMembership?.canEdit;

    if (!canEdit) {
      throw new Error('Insufficient permissions to edit this upload');
    }

    return {
      upload,
      channel: {
        ...upload.channel,
        userMembership,
      },
    };
  });

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string(),
  license: z.enum(UploadLicense),
  publishedAt: z.date(),
  visibility: z.enum(UploadVisibility),
  userCommentsEnabled: z.boolean(),
  downloadsEnabled: z.boolean(),
});

const updateUploadRecordSchema = formSchema.and(
  z.object({
    channelId: z.string(),
    uploadId: z.string(),
  }),
);

const updateUploadRecord = createServerFn({
  method: 'POST',
  response: 'data',
})
  .middleware([requireChannelUploadEditAccessMiddleware])
  .validator(updateUploadRecordSchema)
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    const upload = await db.uploadRecord.findFirst({
      select: {
        id: true,
        channel: {
          select: {
            memberships: {
              select: {
                isAdmin: true,
                canEdit: true,
                appUser: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
      where: {
        id: data.uploadId,
        channelId: data.channelId,
        channel: {
          memberships: {
            some: {
              appUserId: context.session.appUser.id,
            },
          },
        },
      },
    });

    if (!upload) {
      throw new Error('Upload not found or access denied');
    }

    const userMembership = upload.channel.memberships.find(
      (m) => m.appUser.id === context.session?.appUser.id,
    );

    const canEdit = userMembership?.isAdmin || userMembership?.canEdit;

    if (!canEdit) {
      throw new Error('Insufficient permissions to edit this upload');
    }

    const updatedUpload = await db.uploadRecord.update({
      where: { id: data.uploadId },
      data: {
        title: data.title,
        description: data.description,
        license: data.license,
        publishedAt: data.publishedAt,
        visibility: data.visibility,
        userCommentsEnabled: data.userCommentsEnabled,
        downloadsEnabled: data.downloadsEnabled,
      },
      select: {
        id: true,
        title: true,
        description: true,
        license: true,
        visibility: true,
        publishedAt: true,
        userCommentsEnabled: true,
        downloadsEnabled: true,
      },
    });

    return { success: true, upload: updatedUpload };
  });

const uploadQueryOptions = (channelId: string, uploadId: string) => ({
  queryKey: dashboardQueryKeys.uploads.detail(channelId, uploadId),
  queryFn: () => getUploadRecord({ data: { channelId, uploadId } }),
  refetchInterval: (
    query: Query<Awaited<ReturnType<typeof getUploadRecord>>>,
  ) => {
    const data = query.state.data;
    if (!data) return false;

    const isTranscoding = !data.upload.transcodingFinishedAt;
    const isTranscribing = !data.upload.transcribingFinishedAt;

    return isTranscoding || isTranscribing ? 5000 : false;
  },
});

export const Route = createFileRoute(
  '/dashboard_/channels_/$channelId_/uploads_/$uploadId',
)({
  component: ChannelUploadPage,
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(
      uploadQueryOptions(params.channelId, params.uploadId),
    );
    return {
      backNavigation: {
        label: 'Back to uploads',
        to: `/dashboard/channels/${params.channelId}/uploads`,
      },
    };
  },
});

function ChannelUploadPage() {
  const { channelId, uploadId } = Route.useParams();
  const queryClient = useQueryClient();

  const { [uploadId]: uploadProgress } = useStore($uploadProgress, {
    keys: [uploadId],
  });

  const isUploading = typeof uploadProgress === 'number';

  // Single query for all upload data with conditional refetching
  const { data } = useQuery(uploadQueryOptions(channelId, uploadId));

  invariant(data, 'Upload not found');

  const { upload, channel } = data;

  // Current processing status
  const isTranscoding = !upload.transcodingFinishedAt;
  const isTranscribing = !upload.transcribingFinishedAt;
  const isProcessing = isUploading || isTranscoding || isTranscribing;

  const [newThumbnailFile, setNewThumbnailFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const resetDroppedThumbnail = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setNewThumbnailFile(null);
    }
  };

  const updateMutation = useMutation({
    mutationFn: updateUploadRecord,
    onSuccess: async () => {
      showSuccess({
        message: 'Upload details updated successfully!',
      });

      await queryClient.invalidateQueries({
        queryKey: dashboardQueryKeys.uploads.detail(channelId, uploadId),
      });

      await queryClient.invalidateQueries({
        queryKey: dashboardQueryKeys.uploads.all(channelId),
      });
    },
    onError: (error: Error) => {
      showFailure({
        message: error.message || 'Failed to update upload details',
      });
    },
  });

  const licenseOptions = [
    { value: 'STANDARD', label: 'Standard Copyright' },
    { value: 'PUBLIC_DOMAIN', label: 'Public Domain' },
    {
      group: 'Creative Commons',
      items: [
        { value: 'CC_BY', label: 'CC BY' },
        { value: 'CC_BY_SA', label: 'CC BY-SA' },
        { value: 'CC_BY_NC', label: 'CC BY-NC' },
        { value: 'CC_BY_NC_SA', label: 'CC BY-NC-SA' },
        { value: 'CC_BY_ND', label: 'CC BY-ND' },
        { value: 'CC_BY_NC_ND', label: 'CC BY-NC-ND' },
        { value: 'CC0', label: 'CC0' },
      ],
    },
  ];

  const thumbnailUrl =
    upload.overrideThumbnailPath || upload.defaultThumbnailPath;

  const form = useAppMantineForm({
    defaultValues: {
      title: upload.title || '',
      description: upload.description || '',
      license: upload.license,
      publishedAt: new Date(upload.publishedAt),
      visibility: upload.visibility,
      userCommentsEnabled: upload.userCommentsEnabled,
      downloadsEnabled: upload.downloadsEnabled,
    },
    validators: {
      onChange: formSchema,
    },
    onSubmit: async ({ value }) => {
      if (newThumbnailFile) {
        const mpu = await clientCreateMultipartUpload({
          data: {
            channelId,
            targetId: uploadId,
            uploadMimeType: newThumbnailFile.type,
            postProcess: 'thumbnail',
            bytes: newThumbnailFile.size,
          },
        });

        const uploadPromise = doMultipartUpload(
          newThumbnailFile,
          mpu.urls,
          mpu.partSize,
        );

        await clientFinalizeMultipartUpload({
          data: {
            channelId,
            s3UploadKey: mpu.s3UploadKey,
            s3UploadId: mpu.s3UploadId,
            s3PartETags: await uploadPromise,
          },
        });
      }

      updateMutation.mutate({
        data: {
          channelId,
          uploadId,
          ...value,
        },
      });
    },
  });

  return (
    <Container size="xl" py="md" pos="relative">
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => <LoadingOverlay visible={isSubmitting} />}
      </form.Subscribe>
      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            <Title order={1}>Upload details</Title>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <Stack gap="md">
                <form.AppField name="title">
                  {(field) => (
                    <field.TextInputField
                      label="Title (required)"
                      placeholder="Add a title that describes your video"
                      required
                    />
                  )}
                </form.AppField>

                <form.AppField name="description">
                  {(field) => (
                    <field.TextareaField
                      label="Description"
                      placeholder="Tell viewers about your video"
                      minRows={4}
                      maxRows={8}
                      autosize
                    />
                  )}
                </form.AppField>

                <div>
                  <Text fw={500} size="sm" mb="xs">
                    Thumbnail
                  </Text>
                  <Group gap="md" align="flex-start">
                    {thumbnailUrl || previewUrl ? (
                      <Box pos="relative" w={160} h={90}>
                        <Image
                          src={previewUrl || thumbnailUrl}
                          alt="Video thumbnail"
                          w={160}
                          h={90}
                          style={{ objectFit: 'cover', borderRadius: 4 }}
                        />
                        <ActionIcon
                          pos="absolute"
                          top={4}
                          right={4}
                          size="sm"
                          variant="filled"
                          color="dark"
                          onClick={resetDroppedThumbnail}
                        >
                          <IconX size={14} />
                        </ActionIcon>
                        {previewUrl ? (
                          <Text
                            size="xs"
                            c="dimmed"
                            mt={4}
                            style={{ textAlign: 'center' }}
                          >
                            New thumbnail
                          </Text>
                        ) : null}
                      </Box>
                    ) : null}
                    <Dropzone
                      onDrop={(files) => {
                        const file = files[0];
                        if (file) {
                          if (previewUrl) {
                            URL.revokeObjectURL(previewUrl);
                          }
                          const url = URL.createObjectURL(file);
                          setPreviewUrl(url);
                          setNewThumbnailFile(file);
                        }
                      }}
                      maxSize={5 * 1024 ** 2}
                      accept={['image/*']}
                      w={160}
                      h={90}
                    >
                      <Group
                        justify="center"
                        gap="xl"
                        mih={70}
                        style={{ pointerEvents: 'none' }}
                      >
                        <Dropzone.Accept>
                          <IconUpload size={32} stroke={1.5} />
                        </Dropzone.Accept>
                        <Dropzone.Reject>
                          <IconX size={32} stroke={1.5} />
                        </Dropzone.Reject>
                        <Dropzone.Idle>
                          <IconPhoto size={32} stroke={1.5} />
                        </Dropzone.Idle>
                      </Group>
                    </Dropzone>
                  </Group>
                </div>

                <form.AppField name="license">
                  {(field) => (
                    <field.SelectField label="License" data={licenseOptions} />
                  )}
                </form.AppField>

                <form.AppField name="publishedAt">
                  {(field) => (
                    <field.DateTimePickerField label="Published Date" />
                  )}
                </form.AppField>
              </Stack>
            </form>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="lg" mt="lg">
            {/* Action Buttons */}
            <Group gap="sm">
              <form.Subscribe selector={(state) => state.isDirty}>
                {(isDirty) => (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      flex={1}
                      disabled={!isDirty && !newThumbnailFile}
                      onClick={() => {
                        form.reset();
                        resetDroppedThumbnail();
                      }}
                    >
                      Undo changes
                    </Button>
                    <Button
                      size="sm"
                      flex={1}
                      disabled={!isDirty && !newThumbnailFile}
                      loading={updateMutation.isPending}
                      onClick={() => form.handleSubmit()}
                    >
                      Save
                    </Button>
                  </>
                )}
              </form.Subscribe>
            </Group>
            {/* Player or Progress Bars */}
            {isProcessing ? (
              <Stack gap="md">
                {/* Upload Progress */}
                {isUploading ? (
                  <Box>
                    <Text size="sm" fw={500} mb="xs">
                      Uploading file...
                    </Text>
                    <Progress
                      value={uploadProgress * 100}
                      size="lg"
                      animated
                      striped
                    />
                    <Text size="xs" c="dimmed" mt="xs">
                      {Math.round(uploadProgress * 100)}% uploaded
                    </Text>
                  </Box>
                ) : null}

                {/* Transcoding Progress - show when not uploading */}
                {!isUploading ? (
                  <Box>
                    <Text size="sm" fw={500} mb="xs">
                      {isTranscoding
                        ? 'Transcoding video...'
                        : 'Transcoding complete'}
                    </Text>
                    <Progress
                      value={
                        isTranscoding ? upload.transcodingProgress * 100 : 100
                      }
                      size="lg"
                      animated={isTranscoding}
                      striped={isTranscoding}
                      color={isTranscoding ? undefined : 'green'}
                    />
                    <Text size="xs" c="dimmed" mt="xs">
                      {isTranscoding
                        ? `${Math.round(upload.transcodingProgress * 100)}% complete`
                        : 'Video transcoding finished'}
                    </Text>
                  </Box>
                ) : null}

                {/* Transcribing Progress - show when not uploading */}
                {!isUploading ? (
                  <Box>
                    <Text size="sm" fw={500} mb="xs">
                      {isTranscribing
                        ? 'Transcribing audio...'
                        : 'Transcription complete'}
                    </Text>
                    <Progress
                      value={100}
                      size="lg"
                      animated={isTranscribing}
                      striped={isTranscribing}
                      color={isTranscribing ? undefined : 'green'}
                    />
                    <Text size="xs" c="dimmed" mt="xs">
                      {isTranscribing
                        ? 'Processing audio transcript'
                        : 'Audio transcription finished'}
                    </Text>
                  </Box>
                ) : null}
              </Stack>
            ) : (
              <Box
                bg="gray.1"
                h={200}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                }}
              >
                <Text c="dimmed" size="sm">
                  Video Player Placeholder
                </Text>
              </Box>
            )}

            {/* Visibility Settings */}
            <Stack gap="md">
              <Text fw={500} size="sm">
                Visibility
              </Text>
              <form.AppField name="visibility">
                {(field) => (
                  <field.RadioGroupField>
                    <Stack gap="sm">
                      <Radio
                        value="PUBLIC"
                        label={
                          <div>
                            <Text fw={500}>Public</Text>
                            <Text size="xs" c="dimmed">
                              Visible to everyone
                            </Text>
                          </div>
                        }
                      />
                      <Radio
                        value="PRIVATE"
                        label={
                          <div>
                            <Text fw={500}>Private</Text>
                            <Text size="xs" c="dimmed">
                              Visible only to members of {channel.name}
                            </Text>
                          </div>
                        }
                      />
                      <Radio
                        value="UNLISTED"
                        label={
                          <div>
                            <Text fw={500}>Unlisted</Text>
                            <Text size="xs" c="dimmed">
                              Visible everyone with a link
                            </Text>
                          </div>
                        }
                      />
                    </Stack>
                  </field.RadioGroupField>
                )}
              </form.AppField>
            </Stack>

            {/* Comments Settings */}
            <Stack gap="md">
              <Text fw={500} size="sm">
                Comments
              </Text>
              <form.AppField name="userCommentsEnabled">
                {(field) => (
                  <Radio.Group
                    value={field.state.value ? 'ENABLED' : 'DISABLED'}
                    onChange={(value) =>
                      field.handleChange(value === 'ENABLED')
                    }
                  >
                    <Stack gap="sm">
                      <Radio
                        value="ENABLED"
                        label={
                          <div>
                            <Text fw={500}>Enabled</Text>
                            <Text size="xs" c="dimmed">
                              Users can comment on this upload.
                            </Text>
                          </div>
                        }
                      />
                      <Radio
                        value="DISABLED"
                        label={
                          <div>
                            <Text fw={500}>Disabled</Text>
                            <Text size="xs" c="dimmed">
                              Users cannot comment on this upload.
                            </Text>
                          </div>
                        }
                      />
                    </Stack>
                  </Radio.Group>
                )}
              </form.AppField>
            </Stack>

            {/* Downloads Settings */}
            <Stack gap="md">
              <Text fw={500} size="sm">
                Downloads
              </Text>
              <form.AppField name="downloadsEnabled">
                {(field) => (
                  <Radio.Group
                    value={field.state.value ? 'ENABLED' : 'DISABLED'}
                    onChange={(value) =>
                      field.handleChange(value === 'ENABLED')
                    }
                  >
                    <Stack gap="sm">
                      <Radio
                        value="ENABLED"
                        label={
                          <div>
                            <Text fw={500}>Enabled</Text>
                            <Text size="xs" c="dimmed">
                              Users can download this media.
                            </Text>
                          </div>
                        }
                      />
                      <Radio
                        value="DISABLED"
                        label={
                          <div>
                            <Text fw={500}>Disabled</Text>
                            <Text size="xs" c="dimmed">
                              Users cannot download this media.
                            </Text>
                          </div>
                        }
                      />
                    </Stack>
                  </Radio.Group>
                )}
              </form.AppField>
            </Stack>
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
