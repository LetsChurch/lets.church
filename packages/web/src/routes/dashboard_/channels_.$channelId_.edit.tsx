import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Container,
  Grid,
  Group,
  Image,
  Loader,
  LoadingOverlay,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { IconPhoto, IconUpload, IconX } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useAppMantineForm } from '@/components/mantine';
import { showFailure, showSuccess } from '@/routes/-mantine';
import { trpcClient, useTRPC } from '@/trpc/react';
import { preloadImage } from '@/util/image-preload';
import { doMultipartUpload } from '@/util/multipart-upload';

export const Route = createFileRoute('/dashboard_/channels_/$channelId_/edit')({
  component: ChannelEditPage,
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
      trpc.dashboard.channels.getChannelForEdit.queryOptions({
        channelId: params.channelId,
      }),
    );
    return {
      backNavigation: {
        label: 'Back to channel',
        to: '/dashboard/channels/$channelId',
        params: { channelId: params.channelId },
      },
    };
  },
});

function ChannelEditPage() {
  const { channelId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: channel } = useSuspenseQuery(
    trpc.dashboard.channels.getChannelForEdit.queryOptions({
      channelId,
    }),
  );

  const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [avatarUrlBeforeUpload, setAvatarUrlBeforeUpload] = useState<
    string | null
  >(null);

  const [newThumbnailFile, setNewThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(
    null,
  );
  const [isProcessingThumbnail, setIsProcessingThumbnail] = useState(false);
  const [thumbnailUrlBeforeUpload, setThumbnailUrlBeforeUpload] = useState<
    string | null
  >(null);

  const [newCoverFile, setNewCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [isProcessingCover, setIsProcessingCover] = useState(false);
  const [coverUrlBeforeUpload, setCoverUrlBeforeUpload] = useState<
    string | null
  >(null);

  const resetDroppedAvatar = useCallback(() => {
    setAvatarPreviewUrl((previewUrl) => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      return null;
    });
    setNewAvatarFile(null);
  }, []);

  const resetDroppedThumbnail = useCallback(() => {
    setThumbnailPreviewUrl((previewUrl) => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      return null;
    });
    setNewThumbnailFile(null);
  }, []);

  const resetDroppedCover = useCallback(() => {
    setCoverPreviewUrl((previewUrl) => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      return null;
    });
    setNewCoverFile(null);
  }, []);

  // Poll for avatar changes when processing
  useEffect(() => {
    if (!isProcessingAvatar) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelForEdit.queryKey({
            channelId,
          }),
        });
        const updatedChannel = await queryClient.fetchQuery(
          trpc.dashboard.channels.getChannelForEdit.queryOptions({
            channelId,
          }),
        );

        // Check if avatar URL has changed from what it was before upload
        if (updatedChannel.avatarUrl !== avatarUrlBeforeUpload) {
          if (updatedChannel.avatarUrl) {
            // Preload the new avatar image before marking as complete
            try {
              await preloadImage(updatedChannel.avatarUrl);
              setIsProcessingAvatar(false);
              setAvatarUrlBeforeUpload(null);
              resetDroppedAvatar();
              showSuccess({
                title: 'Avatar Updated',
                message: 'Your channel avatar has been processed successfully!',
              });
            } catch (error) {
              console.error('Error preloading avatar image:', error);
              // Still mark as complete even if preload fails
              setIsProcessingAvatar(false);
              setAvatarUrlBeforeUpload(null);
              resetDroppedAvatar();
              showFailure({
                title: 'Avatar Updated',
                message: 'Please refresh the page.',
              });
            }
          } else {
            // No avatar URL, avatar was removed
            setIsProcessingAvatar(false);
            setAvatarUrlBeforeUpload(null);
            resetDroppedAvatar();
            showSuccess({
              title: 'Avatar Removed',
              message: 'Your channel avatar has been removed successfully!',
            });
          }
        }
      } catch (error) {
        console.error('Error polling for avatar changes:', error);
      }
    }, 1000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [
    isProcessingAvatar,
    avatarUrlBeforeUpload,
    queryClient,
    trpc,
    channelId,
    resetDroppedAvatar,
  ]);

  // Poll for thumbnail changes when processing
  useEffect(() => {
    if (!isProcessingThumbnail) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelForEdit.queryKey({
            channelId,
          }),
        });
        const updatedChannel = await queryClient.fetchQuery(
          trpc.dashboard.channels.getChannelForEdit.queryOptions({
            channelId,
          }),
        );

        // Check if thumbnail URL has changed from what it was before upload
        if (updatedChannel.defaultThumbnailUrl !== thumbnailUrlBeforeUpload) {
          if (updatedChannel.defaultThumbnailUrl) {
            // Preload the new thumbnail image before marking as complete
            try {
              await preloadImage(updatedChannel.defaultThumbnailUrl);
              setIsProcessingThumbnail(false);
              setThumbnailUrlBeforeUpload(null);
              resetDroppedThumbnail();
              showSuccess({
                title: 'Thumbnail Updated',
                message:
                  'Your channel default thumbnail has been processed successfully!',
              });
            } catch (error) {
              console.error('Error preloading thumbnail image:', error);
              // Still mark as complete even if preload fails
              setIsProcessingThumbnail(false);
              setThumbnailUrlBeforeUpload(null);
              resetDroppedThumbnail();
              showFailure({
                title: 'Thumbnail Updated',
                message: 'Please refresh the page.',
              });
            }
          } else {
            // No thumbnail URL, thumbnail was removed
            setIsProcessingThumbnail(false);
            setThumbnailUrlBeforeUpload(null);
            resetDroppedThumbnail();
            showSuccess({
              title: 'Thumbnail Removed',
              message:
                'Your channel default thumbnail has been removed successfully!',
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
    resetDroppedThumbnail,
  ]);

  // Poll for cover changes when processing
  useEffect(() => {
    if (!isProcessingCover) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelForEdit.queryKey({
            channelId,
          }),
        });
        const updatedChannel = await queryClient.fetchQuery(
          trpc.dashboard.channels.getChannelForEdit.queryOptions({
            channelId,
          }),
        );

        // Check if cover URL has changed from what it was before upload
        if (updatedChannel.coverUrl !== coverUrlBeforeUpload) {
          if (updatedChannel.coverUrl) {
            // Preload the new cover image before marking as complete
            try {
              await preloadImage(updatedChannel.coverUrl);
              setIsProcessingCover(false);
              setCoverUrlBeforeUpload(null);
              resetDroppedCover();
              showSuccess({
                title: 'Cover Updated',
                message: 'Your channel cover has been processed successfully!',
              });
            } catch (error) {
              console.error('Error preloading cover image:', error);
              // Still mark as complete even if preload fails
              setIsProcessingCover(false);
              setCoverUrlBeforeUpload(null);
              resetDroppedCover();
              showFailure({
                title: 'Cover Updated',
                message: 'Please refresh the page.',
              });
            }
          } else {
            // No cover URL, cover was removed
            setIsProcessingCover(false);
            setCoverUrlBeforeUpload(null);
            resetDroppedCover();
            showSuccess({
              title: 'Cover Removed',
              message: 'Your channel cover has been removed successfully!',
            });
          }
        }
      } catch (error) {
        console.error('Error polling for cover changes:', error);
      }
    }, 1000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [
    isProcessingCover,
    coverUrlBeforeUpload,
    queryClient,
    trpc,
    channelId,
    resetDroppedCover,
  ]);

  const updateMutation = useMutation(
    trpc.dashboard.channels.updateChannel.mutationOptions({
      onSuccess: async () => {
        // Only show success message if not processing avatar, thumbnail, or cover
        // (processing success will be shown by the polling effects)
        if (
          !isProcessingAvatar &&
          !isProcessingThumbnail &&
          !isProcessingCover
        ) {
          showSuccess({
            message: 'Channel updated successfully!',
          });
        }

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelDetails.queryKey({
            channelId,
          }),
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannels.queryKey(),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to update channel',
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
      name: channel.name || '',
      slug: channel.slug || '',
      description: channel.description || '',
      visibility: channel.visibility,
      websiteUrl: channel.websiteUrl || '',
      facebookUrl: channel.facebookUrl || '',
      instagramUrl: channel.instagramUrl || '',
      xUrl: channel.xUrl || '',
      youtubeUrl: channel.youtubeUrl || '',
      tiktokUrl: channel.tiktokUrl || '',
      linkedinUrl: channel.linkedinUrl || '',
      threadsUrl: channel.threadsUrl || '',
      applePodcastsUrl: channel.applePodcastsUrl || '',
      spotifyUrl: channel.spotifyUrl || '',
      rssUrl: channel.rssUrl || '',
      defaultUploadVisibility: channel.defaultUploadVisibility ?? 'PRIVATE',
      defaultUploadLicense: channel.defaultUploadLicense ?? 'STANDARD',
      defaultUploadCommentsEnabled:
        channel.defaultUploadCommentsEnabled ?? true,
      defaultUploadDownloadsEnabled:
        channel.defaultUploadDownloadsEnabled ?? true,
    },
    onSubmit: async ({ value }) => {
      if (newAvatarFile) {
        setAvatarUrlBeforeUpload(channel.avatarUrl);

        const mpu =
          await trpcClient.dashboard.channels.createMultipartUpload.mutate({
            channelId,
            targetId: channelId,
            uploadMimeType: newAvatarFile.type,
            bytes: newAvatarFile.size,
            postProcess: 'channelAvatar',
          });

        const uploadPromise = doMultipartUpload(
          newAvatarFile,
          mpu.urls,
          mpu.partSize,
        );

        await trpcClient.dashboard.channels.finalizeMultipartUpload.mutate({
          channelId,
          s3UploadKey: mpu.s3UploadKey,
          s3UploadId: mpu.s3UploadId,
          s3PartETags: await uploadPromise,
        });

        setIsProcessingAvatar(true);
      }

      if (newThumbnailFile) {
        setThumbnailUrlBeforeUpload(channel.defaultThumbnailUrl);

        const mpu =
          await trpcClient.dashboard.channels.createMultipartUpload.mutate({
            channelId,
            targetId: channelId,
            uploadMimeType: newThumbnailFile.type,
            bytes: newThumbnailFile.size,
            postProcess: 'channelDefaultThumbnail',
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

      if (newCoverFile) {
        setCoverUrlBeforeUpload(channel.coverUrl);

        const mpu =
          await trpcClient.dashboard.channels.createMultipartUpload.mutate({
            channelId,
            targetId: channelId,
            uploadMimeType: newCoverFile.type,
            bytes: newCoverFile.size,
            postProcess: 'channelCover',
          });

        const uploadPromise = doMultipartUpload(
          newCoverFile,
          mpu.urls,
          mpu.partSize,
        );

        await trpcClient.dashboard.channels.finalizeMultipartUpload.mutate({
          channelId,
          s3UploadKey: mpu.s3UploadKey,
          s3UploadId: mpu.s3UploadId,
          s3PartETags: await uploadPromise,
        });

        setIsProcessingCover(true);
      }

      updateMutation.mutate({ channelId, ...value });
    },
  });

  // Update form values when data loads
  if (channel) {
    form.reset({
      name: channel.name || '',
      slug: channel.slug || '',
      description: channel.description || '',
      visibility: channel.visibility,
      websiteUrl: channel.websiteUrl || '',
      facebookUrl: channel.facebookUrl || '',
      instagramUrl: channel.instagramUrl || '',
      xUrl: channel.xUrl || '',
      youtubeUrl: channel.youtubeUrl || '',
      tiktokUrl: channel.tiktokUrl || '',
      linkedinUrl: channel.linkedinUrl || '',
      threadsUrl: channel.threadsUrl || '',
      applePodcastsUrl: channel.applePodcastsUrl || '',
      spotifyUrl: channel.spotifyUrl || '',
      rssUrl: channel.rssUrl || '',
      defaultUploadVisibility: channel.defaultUploadVisibility ?? 'PRIVATE',
      defaultUploadLicense: channel.defaultUploadLicense ?? 'STANDARD',
      defaultUploadCommentsEnabled:
        channel.defaultUploadCommentsEnabled ?? true,
      defaultUploadDownloadsEnabled:
        channel.defaultUploadDownloadsEnabled ?? true,
    });
  }

  return (
    <Container size="xl" py="md" pos="relative">
      <LoadingOverlay visible={updateMutation.isPending} />

      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            <Title order={1}>Edit Channel</Title>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <Stack gap="md">
                <form.AppField name="name">
                  {(field) => (
                    <field.TextInputField
                      label="Channel Name (required)"
                      placeholder="Enter channel name"
                      required
                    />
                  )}
                </form.AppField>

                <form.AppField name="slug">
                  {(field) => (
                    <Stack gap="xs">
                      <field.TextInputField
                        label="Channel Slug (required)"
                        placeholder="channel-slug"
                        required
                      />
                      <Text size="xs" c="dimmed">
                        This will be used in your channel URL. Only letters,
                        numbers, underscores, and hyphens are allowed.
                      </Text>
                    </Stack>
                  )}
                </form.AppField>

                <form.AppField name="description">
                  {(field) => (
                    <field.TextareaField
                      label="Description"
                      placeholder="Describe your channel"
                      minRows={4}
                      maxRows={8}
                      autosize
                    />
                  )}
                </form.AppField>

                <form.AppField name="websiteUrl">
                  {(field) => (
                    <field.TextInputField
                      label="Website URL"
                      placeholder="https://example.com"
                      type="url"
                    />
                  )}
                </form.AppField>

                {/* Cover Section */}
                <Stack gap="xs">
                  <Text fw={500} size="sm">
                    Cover Image
                  </Text>
                  <Text size="xs" c="dimmed">
                    This cover image will be displayed at the top of your
                    channel page. Recommended size: 1920x1080.
                  </Text>
                  <Tooltip
                    label="Click or drop image to change cover"
                    withArrow
                    position="bottom"
                  >
                    <Box pos="relative" w={640} h={360}>
                      <Dropzone
                        onDrop={(files) => {
                          const file = files[0];
                          if (file) {
                            if (coverPreviewUrl) {
                              URL.revokeObjectURL(coverPreviewUrl);
                            }
                            const url = URL.createObjectURL(file);
                            setCoverPreviewUrl(url);
                            setNewCoverFile(file);
                          }
                        }}
                        accept={['image/*']}
                        w={640}
                        h={360}
                        disabled={isProcessingCover}
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
                            minHeight: '360px',
                          },
                        }}
                        onMouseEnter={(e) => {
                          if (!isProcessingCover) {
                            const overlay = e.currentTarget.querySelector(
                              '.dropzone-overlay',
                            ) as HTMLElement;
                            if (overlay) overlay.style.opacity = '1';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isProcessingCover) {
                            const overlay = e.currentTarget.querySelector(
                              '.dropzone-overlay',
                            ) as HTMLElement;
                            if (overlay) overlay.style.opacity = '0';
                          }
                        }}
                      >
                        <Box pos="relative" w="100%" h="100%">
                          {channel.coverUrl || coverPreviewUrl ? (
                            <Image
                              src={coverPreviewUrl || channel.coverUrl}
                              alt="Channel cover"
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
                              opacity: isProcessingCover ? 1 : 0,
                              transition: 'opacity 0.2s ease',
                              pointerEvents: 'none',
                            }}
                            className="dropzone-overlay"
                          >
                            {isProcessingCover ? (
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
                                  <IconX size={32} stroke={1.5} color="white" />
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

                      {newCoverFile && (
                        <ActionIcon
                          pos="absolute"
                          top={4}
                          right={4}
                          size="sm"
                          variant="filled"
                          color="dark"
                          onClick={resetDroppedCover}
                          style={{ zIndex: 10 }}
                        >
                          <IconX size={14} />
                        </ActionIcon>
                      )}

                      {coverPreviewUrl && !isProcessingCover && (
                        <Text
                          size="xs"
                          c="dimmed"
                          mt={4}
                          style={{ textAlign: 'center' }}
                        >
                          New cover
                        </Text>
                      )}
                    </Box>
                  </Tooltip>
                </Stack>

                <Title order={3} mt="lg">
                  Social Media Links
                </Title>

                <SimpleGrid cols={2} spacing="md">
                  <form.AppField name="facebookUrl">
                    {(field) => (
                      <field.TextInputField
                        label="Facebook URL"
                        placeholder="https://facebook.com/yourchannel"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="instagramUrl">
                    {(field) => (
                      <field.TextInputField
                        label="Instagram URL"
                        placeholder="https://instagram.com/yourchannel"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="xUrl">
                    {(field) => (
                      <field.TextInputField
                        label="X (Twitter) URL"
                        placeholder="https://x.com/yourchannel"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="youtubeUrl">
                    {(field) => (
                      <field.TextInputField
                        label="YouTube URL"
                        placeholder="https://youtube.com/@yourchannel"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="tiktokUrl">
                    {(field) => (
                      <field.TextInputField
                        label="TikTok URL"
                        placeholder="https://tiktok.com/@yourchannel"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="linkedinUrl">
                    {(field) => (
                      <field.TextInputField
                        label="LinkedIn URL"
                        placeholder="https://linkedin.com/company/yourchannel"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="threadsUrl">
                    {(field) => (
                      <field.TextInputField
                        label="Threads URL"
                        placeholder="https://threads.net/@yourchannel"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="applePodcastsUrl">
                    {(field) => (
                      <field.TextInputField
                        label="Apple Podcasts URL"
                        placeholder="https://podcasts.apple.com/..."
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="spotifyUrl">
                    {(field) => (
                      <field.TextInputField
                        label="Spotify URL"
                        placeholder="https://open.spotify.com/..."
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="rssUrl">
                    {(field) => (
                      <field.TextInputField
                        label="RSS Feed URL"
                        placeholder="https://yourchannel.com/feed.xml"
                        type="url"
                      />
                    )}
                  </form.AppField>
                </SimpleGrid>

                {/* Default Upload Settings */}
                <Title order={3} mt="lg">
                  Default Upload Settings
                </Title>

                <form.AppField name="defaultUploadVisibility">
                  {(field) => (
                    <Select
                      label="Default Visibility"
                      data={[
                        { value: 'PUBLIC', label: 'Public' },
                        { value: 'PRIVATE', label: 'Private' },
                        { value: 'UNLISTED', label: 'Unlisted' },
                      ]}
                      value={field.state.value ?? null}
                      onChange={(val) =>
                        field.handleChange(val as typeof field.state.value)
                      }
                    />
                  )}
                </form.AppField>

                <form.AppField name="defaultUploadLicense">
                  {(field) => (
                    <Select
                      label="Default License"
                      data={licenseOptions}
                      value={field.state.value ?? null}
                      onChange={(val) =>
                        field.handleChange(val as typeof field.state.value)
                      }
                    />
                  )}
                </form.AppField>

                <form.AppField name="defaultUploadCommentsEnabled">
                  {(field) => (
                    <Checkbox
                      label="Enable comments on new uploads"
                      checked={field.state.value ?? true}
                      onChange={(e) =>
                        field.handleChange(e.currentTarget.checked)
                      }
                    />
                  )}
                </form.AppField>

                <form.AppField name="defaultUploadDownloadsEnabled">
                  {(field) => (
                    <Checkbox
                      label="Enable downloads on new uploads"
                      checked={field.state.value ?? true}
                      onChange={(e) =>
                        field.handleChange(e.currentTarget.checked)
                      }
                    />
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
                  isSubmitting: state.isSubmitting,
                  isDirty: state.isDirty,
                })}
              >
                {({ isSubmitting, isDirty }) => (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      flex={1}
                      disabled={
                        !isDirty &&
                        !newAvatarFile &&
                        !newThumbnailFile &&
                        !newCoverFile
                      }
                      onClick={() => {
                        form.reset();
                        resetDroppedAvatar();
                        resetDroppedThumbnail();
                        resetDroppedCover();
                      }}
                    >
                      Undo changes
                    </Button>
                    <Button
                      size="sm"
                      flex={1}
                      disabled={
                        !isDirty &&
                        !newAvatarFile &&
                        !newThumbnailFile &&
                        !newCoverFile
                      }
                      loading={isSubmitting}
                      onClick={() => form.handleSubmit()}
                    >
                      Save Changes
                    </Button>
                  </>
                )}
              </form.Subscribe>
            </Group>

            {/* Avatar Section */}
            <Group gap="md" justify="center">
              <Tooltip
                label="Click or drop image to change channel avatar"
                withArrow
                position="bottom"
              >
                <Box pos="relative" w={120} h={120}>
                  <Dropzone
                    onDrop={(files) => {
                      const file = files[0];
                      if (file) {
                        if (avatarPreviewUrl) {
                          URL.revokeObjectURL(avatarPreviewUrl);
                        }
                        const url = URL.createObjectURL(file);
                        setAvatarPreviewUrl(url);
                        setNewAvatarFile(file);
                      }
                    }}
                    accept={['image/*']}
                    w={120}
                    h={120}
                    disabled={isProcessingAvatar}
                    style={{
                      borderRadius: '50%',
                      padding: 0,
                      border: 'none',
                      overflow: 'hidden',
                      cursor: 'pointer',
                    }}
                    styles={{
                      inner: {
                        height: '100%',
                        minHeight: '120px',
                      },
                    }}
                    onMouseEnter={(e) => {
                      if (!isProcessingAvatar) {
                        const overlay = e.currentTarget.querySelector(
                          '.dropzone-overlay',
                        ) as HTMLElement;
                        if (overlay) overlay.style.opacity = '1';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isProcessingAvatar) {
                        const overlay = e.currentTarget.querySelector(
                          '.dropzone-overlay',
                        ) as HTMLElement;
                        if (overlay) overlay.style.opacity = '0';
                      }
                    }}
                  >
                    <Box pos="relative" w="100%" h="100%">
                      {channel.avatarUrl || avatarPreviewUrl ? (
                        <Image
                          src={avatarPreviewUrl || channel.avatarUrl}
                          alt="Channel avatar"
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
                          opacity: isProcessingAvatar ? 1 : 0,
                          transition: 'opacity 0.2s ease',
                          pointerEvents: 'none',
                        }}
                        className="dropzone-overlay"
                      >
                        {isProcessingAvatar ? (
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
                              <IconX size={32} stroke={1.5} color="white" />
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

                  {newAvatarFile && (
                    <ActionIcon
                      pos="absolute"
                      top={4}
                      right={4}
                      size="sm"
                      variant="filled"
                      color="dark"
                      onClick={resetDroppedAvatar}
                      style={{ zIndex: 10 }}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  )}

                  {avatarPreviewUrl && !isProcessingAvatar && (
                    <Text
                      size="xs"
                      c="dimmed"
                      mt={4}
                      style={{ textAlign: 'center' }}
                    >
                      New avatar
                    </Text>
                  )}
                </Box>
              </Tooltip>
            </Group>

            {/* Default Thumbnail Section */}
            <Stack gap="xs">
              <Text fw={500} size="sm">
                Default Thumbnail
              </Text>
              <Text size="xs" c="dimmed">
                This thumbnail will be used for uploads in this channel that
                don't have their own thumbnail.
              </Text>
              <Tooltip
                label="Click or drop image to change default thumbnail"
                withArrow
                position="bottom"
              >
                <Box pos="relative" w={320} h={180}>
                  <Dropzone
                    onDrop={(files) => {
                      const file = files[0];
                      if (file) {
                        if (thumbnailPreviewUrl) {
                          URL.revokeObjectURL(thumbnailPreviewUrl);
                        }
                        const url = URL.createObjectURL(file);
                        setThumbnailPreviewUrl(url);
                        setNewThumbnailFile(file);
                      }
                    }}
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
                      {channel.defaultThumbnailUrl || thumbnailPreviewUrl ? (
                        <Image
                          src={
                            thumbnailPreviewUrl || channel.defaultThumbnailUrl
                          }
                          alt="Channel default thumbnail"
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
                              <IconX size={32} stroke={1.5} color="white" />
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

                  {thumbnailPreviewUrl && !isProcessingThumbnail && (
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
            </Stack>

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
                              Anyone can discover and view your channel
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
                              Only channel members can view content
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
                              Not discoverable, but accessible with a link
                            </Text>
                          </div>
                        }
                      />
                    </Stack>
                  </field.RadioGroupField>
                )}
              </form.AppField>
            </Stack>
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
