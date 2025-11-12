import {
  ActionIcon,
  Box,
  Button,
  Container,
  CopyButton,
  Grid,
  Group,
  Image,
  Loader,
  LoadingOverlay,
  Modal,
  Progress,
  Radio,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useStore } from '@nanostores/react';
import {
  IconCheck,
  IconCopy,
  IconPhoto,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import HlsVideo from 'hls-video-element/react';
import { useCallback, useEffect, useState } from 'react';
import { useAppMantineForm } from '@/components/mantine';
import { uploadFormSchema } from '@/schemas/dashboard';
import { trpcClient, useTRPC } from '@/trpc/react';
import { doMultipartUpload } from '@/util/multipart-upload';
import { showFailure, showSuccess } from '../-mantine';
import styles from './-styles.module.css';
import {
  $deletedUploads,
  $uploadProgress,
} from './channels_.$channelId_.uploads';

export const Route = createFileRoute(
  '/dashboard_/channels_/$channelId_/uploads_/$uploadId',
)({
  component: ChannelUploadPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.channels.getUploadRecord.queryOptions({
        channelId: params.channelId,
        uploadId: params.uploadId,
      }),
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const { [uploadId]: uploadProgress } = useStore($uploadProgress, {
    keys: [uploadId],
  });

  const isUploading = typeof uploadProgress === 'number';

  // Single query for all upload data with conditional refetching
  const { data } = useSuspenseQuery({
    ...trpc.dashboard.channels.getUploadRecord.queryOptions({
      channelId,
      uploadId,
    }),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;

      const isTranscoding = !data.upload.transcodingFinishedAt;
      const isTranscribing = !data.upload.transcribingFinishedAt;

      return isTranscoding || isTranscribing ? 5000 : false;
    },
  });

  const { upload, channel } = data;

  // Current processing status
  const isTranscoding = !upload.transcodingFinishedAt;
  const isTranscribing = !upload.transcribingFinishedAt;
  const isProcessing = isUploading || isTranscoding || isTranscribing;

  // Check if user is site admin
  // userMembership comes from the channel and contains the current user's membership
  // which includes the appUser role
  const isSiteAdmin =
    channel.userMembership &&
    'appUser' in channel.userMembership &&
    channel.userMembership.appUser.role === 'ADMIN';

  // Permission logic matching the uploads list page
  const isChannelAdmin = channel.userMembership?.isAdmin ?? false;
  const isAdmin = isChannelAdmin || isSiteAdmin;
  const canDelete = isAdmin; // Only channel admins and site admins can delete

  const [newThumbnailFile, setNewThumbnailFile] = useState<File | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessingThumbnail, setIsProcessingThumbnail] = useState(false);
  const [thumbnailUrlBeforeUpload, setThumbnailUrlBeforeUpload] = useState<
    string | null
  >(null);

  const resetDroppedThumbnail = useCallback(() => {
    setPreviewUrl((previewUrl) => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      return null;
    });
    setNewThumbnailFile(null);
  }, []);

  // Poll for thumbnail changes when processing
  useEffect(() => {
    if (!isProcessingThumbnail) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        });

        const currentData = queryClient.getQueryData(
          trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        ) as typeof data;

        if (currentData) {
          const currentThumbnailUrl = currentData.upload.thumbnailUrl;

          // Check if thumbnail URL has changed from what it was before upload
          if (currentThumbnailUrl !== thumbnailUrlBeforeUpload) {
            setIsProcessingThumbnail(false);
            setThumbnailUrlBeforeUpload(null);
            showSuccess({
              title: 'Thumbnail Updated',
              message: 'Your thumbnail has been processed successfully!',
            });
          }
        }
      } catch (error) {
        console.error('Error polling for thumbnail changes:', error);
      }
    }, 1000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [
    isProcessingThumbnail,
    thumbnailUrlBeforeUpload,
    queryClient,
    trpc,
    channelId,
    uploadId,
  ]);

  const updateMutation = useMutation(
    trpc.dashboard.channels.updateUploadRecord.mutationOptions({
      onSuccess: async () => {
        // Only show success message if not processing thumbnail
        // (thumbnail processing success will be shown by the polling effect)
        if (!isProcessingThumbnail) {
          showSuccess({
            message: 'Upload details updated successfully!',
          });
        }

        resetDroppedThumbnail();

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelUploads.queryKey({
            channelId,
          }),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to update upload details',
        });
      },
    }),
  );

  const toggleFeaturedMutation = useMutation(
    trpc.dashboard.admin.toggleFeaturedUpload.mutationOptions({
      onSuccess: async ({ isFeatured }) => {
        showSuccess({
          message: isFeatured
            ? 'Upload added to featured!'
            : 'Upload removed from featured',
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelUploads.queryKey({
            channelId,
          }),
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getFeaturedUploads.queryKey(),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to toggle featured status',
        });
      },
    }),
  );

  const deleteUploadMutation = useMutation(
    trpc.dashboard.channels.deleteUploadRecord.mutationOptions({
      onSuccess: async ({ uploadId }) => {
        $deletedUploads.setKey(uploadId, true);
        showSuccess({ message: 'Upload deletion started successfully' });
        setShowDeleteModal(false);

        // Navigate back to the uploads list
        await navigate({
          to: `/dashboard/channels/${channelId}/uploads`,
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to delete upload',
        });
      },
    }),
  );

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
      onChange: uploadFormSchema,
    },
    onSubmit: async ({ value }) => {
      if (newThumbnailFile) {
        setThumbnailUrlBeforeUpload(upload.thumbnailUrl);

        const mpu =
          await trpcClient.dashboard.channels.createMultipartUpload.mutate({
            channelId,
            targetId: uploadId,
            uploadMimeType: newThumbnailFile.type,
            postProcess: 'thumbnail',
            bytes: newThumbnailFile.size,
          });

        const uploadPromise = doMultipartUpload(
          newThumbnailFile,
          mpu.urls,
          mpu.partSize,
        );

        await trpcClient.dashboard.channels.finalizeMultipartUpload.mutate({
          channelId,
          s3UploadKey: mpu.s3UploadKey,
          s3UploadId: mpu.s3UploadId,
          s3PartETags: await uploadPromise,
        });

        setIsProcessingThumbnail(true);
      }

      updateMutation.mutate({
        channelId,
        uploadId,
        ...value,
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
                      label="Title"
                      placeholder="Add a title that describes your upload"
                    />
                  )}
                </form.AppField>

                <form.AppField name="description">
                  {(field) => (
                    <field.TextareaField
                      label="Description"
                      placeholder="Tell viewers about your upload"
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
                  <Group gap="md" justify="flex-start">
                    <Tooltip
                      label="Click or drop image to change thumbnail"
                      withArrow
                      position="bottom"
                    >
                      <Box pos="relative" w={320} h={180}>
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
                          w={320}
                          h={180}
                          disabled={isProcessingThumbnail}
                          style={{
                            borderRadius: 4,
                            padding: 0,
                            border: 'none',
                            overflow: 'hidden',
                            cursor: 'pointer',
                          }}
                          styles={{
                            inner: {
                              height: '100%',
                              minHeight: '180px',
                            },
                          }}
                          onMouseEnter={(e) => {
                            if (!isProcessingThumbnail) {
                              const overlay = e.currentTarget.querySelector(
                                '.dropzone-overlay',
                              ) as HTMLElement;
                              if (overlay) overlay.style.opacity = '1';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isProcessingThumbnail) {
                              const overlay = e.currentTarget.querySelector(
                                '.dropzone-overlay',
                              ) as HTMLElement;
                              if (overlay) overlay.style.opacity = '0';
                            }
                          }}
                        >
                          <Box pos="relative" w="100%" h="100%">
                            {upload.thumbnailUrl || previewUrl ? (
                              <Image
                                src={previewUrl || upload.thumbnailUrl}
                                alt="Upload thumbnail"
                                w="100%"
                                h="100%"
                                style={{ objectFit: 'cover' }}
                              />
                            ) : (
                              <Box
                                w="100%"
                                h="100%"
                                bg="gray.1"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <IconPhoto
                                  size={32}
                                  stroke={1.5}
                                  color="var(--mantine-color-gray-5)"
                                />
                              </Box>
                            )}

                            <Box
                              pos="absolute"
                              top={0}
                              left={0}
                              right={0}
                              bottom={0}
                              bg="rgba(0, 0, 0, 0.5)"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: isProcessingThumbnail ? 1 : 0,
                                transition: 'opacity 0.2s ease',
                                pointerEvents: 'none',
                              }}
                              className="dropzone-overlay"
                            >
                              {isProcessingThumbnail ? (
                                <Box
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '100%',
                                    height: '100%',
                                  }}
                                >
                                  <Loader size="md" color="white" />
                                </Box>
                              ) : (
                                <>
                                  <Dropzone.Accept>
                                    <IconUpload
                                      size={32}
                                      stroke={1.5}
                                      color="white"
                                    />
                                  </Dropzone.Accept>
                                  <Dropzone.Reject>
                                    <IconX
                                      size={32}
                                      stroke={1.5}
                                      color="white"
                                    />
                                  </Dropzone.Reject>
                                  <Dropzone.Idle>
                                    <IconUpload
                                      size={32}
                                      stroke={1.5}
                                      color="white"
                                    />
                                  </Dropzone.Idle>
                                </>
                              )}
                            </Box>
                          </Box>
                        </Dropzone>

                        {newThumbnailFile && (
                          <ActionIcon
                            pos="absolute"
                            top={4}
                            right={4}
                            size="sm"
                            variant="filled"
                            color="dark"
                            onClick={resetDroppedThumbnail}
                            style={{ zIndex: 10 }}
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        )}

                        {previewUrl && !isProcessingThumbnail && (
                          <Text
                            size="xs"
                            c="dimmed"
                            mt={4}
                            style={{ textAlign: 'center' }}
                          >
                            New thumbnail
                          </Text>
                        )}
                      </Box>
                    </Tooltip>
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
              <form.Subscribe
                selector={(state) => ({
                  isDirty: state.isDirty,
                  isValid: state.isValid,
                })}
              >
                {({ isDirty, isValid }) => (
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
                      disabled={(!isDirty && !newThumbnailFile) || !isValid}
                      loading={updateMutation.isPending}
                      onClick={() => form.handleSubmit()}
                    >
                      Save
                    </Button>
                  </>
                )}
              </form.Subscribe>
            </Group>

            {/* Featured Toggle - Only for site admins */}
            {isSiteAdmin ? (
              <Button
                variant={upload.isFeatured ? 'filled' : 'light'}
                color={upload.isFeatured ? 'yellow' : 'gray'}
                leftSection={
                  upload.isFeatured ? (
                    <IconStarFilled size={16} />
                  ) : (
                    <IconStar size={16} />
                  )
                }
                onClick={() => {
                  toggleFeaturedMutation.mutate({ uploadId });
                }}
                loading={toggleFeaturedMutation.isPending}
                fullWidth
              >
                {upload.isFeatured ? 'Remove from Featured' : 'Add to Featured'}
              </Button>
            ) : null}

            {/* Delete Button - Only for channel admins and site admins */}
            {canDelete ? (
              <Button
                variant="light"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={() => setShowDeleteModal(true)}
                fullWidth
              >
                Delete Upload
              </Button>
            ) : null}

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
            ) : upload.mediaSource || upload.audioSource ? (
              <HlsVideo
                src={upload.mediaSource || upload.audioSource || ''}
                className={styles.fullWidth}
                playsInline
                controls
              />
            ) : (
              <Box
                bg="gray.1"
                p="md"
                style={{
                  borderRadius: '4px',
                  textAlign: 'center',
                }}
              >
                <Text size="sm" c="dimmed">
                  No media available for playback
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

            {/* Embed Code */}
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Text fw={500} size="sm">
                  Embed Code
                </Text>
                <CopyButton
                  value={`<iframe src="${typeof window !== 'undefined' ? window.location.origin : 'https://lets.church'}/embed/media/${uploadId}" width="1920" height="1080" frameborder="0" allowfullscreen allow="fullscreen; picture-in-picture"></iframe>`}
                >
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied!' : 'Copy embed code'}>
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={
                          copied ? (
                            <IconCheck size={14} />
                          ) : (
                            <IconCopy size={14} />
                          )
                        }
                        onClick={copy}
                        color={copied ? 'green' : undefined}
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
              <Textarea
                readOnly
                value={`<iframe src="${typeof window !== 'undefined' ? window.location.origin : 'https://lets.church'}/embed/media/${uploadId}" width="1920" height="1080" frameborder="0" allowfullscreen allow="fullscreen; picture-in-picture"></iframe>`}
                autosize
                minRows={3}
                maxRows={5}
                styles={{
                  input: {
                    fontFamily: 'monospace',
                    fontSize: '12px',
                  },
                }}
              />
              <Text size="xs" c="dimmed">
                Use this code to embed the media player on external websites.
              </Text>
            </Stack>
          </Stack>
        </Grid.Col>
      </Grid>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Confirm Delete"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete the upload "
            {upload.title || 'Untitled Upload'}"?
          </Text>
          <Text size="sm" c="dimmed">
            This action cannot be undone. The upload will be permanently removed
            from all storage systems.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleteUploadMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                deleteUploadMutation.mutate({
                  channelId,
                  uploadId,
                });
              }}
              loading={deleteUploadMutation.isPending}
            >
              Delete Upload
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
