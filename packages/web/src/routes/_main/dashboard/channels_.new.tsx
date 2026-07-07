import { IconPhoto, IconUpload, IconX } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';

import {
  ActionIcon,
  Button,
  Loader,
  LoadingOverlay,
  Radio,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { Dropzone } from '@/components/ui/dropzone';
import { useAppForm } from '@/components/ui/form';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useAutoSlug } from '@/hooks/use-auto-slug';
import { trpcClient, useTRPC } from '@/trpc/react';
import { preloadImage } from '@/util/image-preload';
import { doMultipartUpload } from '@/util/multipart-upload';

export const Route = createFileRoute('/_main/dashboard/channels_/new')({
  component: CreateChannelPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: () => ({
    backNavigation: {
      label: 'My Channels',
      to: '/dashboard/channels',
    },
  }),
});

function CreateChannelPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const autoSlug = useAutoSlug();

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

  const [createdChannelId, setCreatedChannelId] = useState<string | null>(null);

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

  // Poll for avatar changes when processing
  useEffect(() => {
    if (!isProcessingAvatar || !createdChannelId) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const updatedChannel = await queryClient.fetchQuery(
          trpc.dashboard.channels.getChannelForEdit.queryOptions({
            channelId: createdChannelId,
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
    createdChannelId,
    avatarUrlBeforeUpload,
    queryClient,
    trpc,
    resetDroppedAvatar,
  ]);

  // Poll for thumbnail changes when processing
  useEffect(() => {
    if (!isProcessingThumbnail || !createdChannelId) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const updatedChannel = await queryClient.fetchQuery(
          trpc.dashboard.channels.getChannelForEdit.queryOptions({
            channelId: createdChannelId,
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
    createdChannelId,
    thumbnailUrlBeforeUpload,
    queryClient,
    trpc,
    resetDroppedThumbnail,
  ]);

  const createMutation = useMutation(
    trpc.dashboard.channels.createChannel.mutationOptions({
      onSuccess: async () => {
        showSuccess({
          message: 'Channel created successfully!',
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannels.queryKey(),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to create channel',
        });
      },
    }),
  );

  // Navigate to channel page when all processing is complete
  useEffect(() => {
    if (
      createdChannelId &&
      !isProcessingAvatar &&
      !isProcessingThumbnail &&
      // Only navigate if we're not currently creating the channel
      !createMutation.isPending
    ) {
      navigate({
        to: '/dashboard/channels/$channelId',
        params: { channelId: createdChannelId },
      });
    }
  }, [
    createdChannelId,
    isProcessingAvatar,
    isProcessingThumbnail,
    createMutation.isPending,
    navigate,
  ]);

  const form = useAppForm({
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      visibility: 'PUBLIC' as const,
    },
    onSubmit: async ({ value }) => {
      const channel = await createMutation.mutateAsync(value);
      setCreatedChannelId(channel.id);

      if (newAvatarFile && channel.id) {
        setAvatarUrlBeforeUpload(null);

        const mpu =
          await trpcClient.dashboard.channels.createMultipartUpload.mutate({
            channelId: channel.id,
            targetId: channel.id,
            uploadMimeType: newAvatarFile.type,
            postProcess: 'channelAvatar',
            bytes: newAvatarFile.size,
          });

        const uploadPromise = doMultipartUpload(
          newAvatarFile,
          mpu.urls,
          mpu.partSize,
        );

        await trpcClient.dashboard.channels.finalizeMultipartUpload.mutate({
          channelId: channel.id,
          s3UploadKey: mpu.s3UploadKey,
          s3UploadId: mpu.s3UploadId,
          s3PartETags: await uploadPromise,
        });

        setIsProcessingAvatar(true);
      }

      if (newThumbnailFile && channel.id) {
        setThumbnailUrlBeforeUpload(null);

        const mpu =
          await trpcClient.dashboard.channels.createMultipartUpload.mutate({
            channelId: channel.id,
            targetId: channel.id,
            uploadMimeType: newThumbnailFile.type,
            postProcess: 'channelDefaultThumbnail',
            bytes: newThumbnailFile.size,
          });

        const uploadPromise = doMultipartUpload(
          newThumbnailFile,
          mpu.urls,
          mpu.partSize,
        );

        await trpcClient.dashboard.channels.finalizeMultipartUpload.mutate({
          channelId: channel.id,
          s3UploadKey: mpu.s3UploadKey,
          s3UploadId: mpu.s3UploadId,
          s3PartETags: await uploadPromise,
        });

        setIsProcessingThumbnail(true);
      }

      // Navigation will be handled by the useEffect that watches
      // isProcessingAvatar and isProcessingThumbnail
    },
  });

  return (
    <div className="relative mx-auto w-full max-w-7xl px-4 py-4">
      <LoadingOverlay visible={createMutation.isPending} />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
        <div className="md:col-span-8">
          <div className="flex flex-col gap-5">
            <Title order={1}>Create Channel</Title>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <div className="flex flex-col gap-4">
                <form.AppField
                  name="name"
                  listeners={{
                    onChange: ({ value }) => {
                      const next = autoSlug.onNameChange(value);
                      if (next !== null) {
                        form.setFieldValue('slug', next);
                      }
                    },
                  }}
                >
                  {(field) => (
                    <field.TextInputField
                      label="Channel Name (required)"
                      placeholder="Enter channel name"
                      required
                    />
                  )}
                </form.AppField>

                <form.AppField
                  name="slug"
                  listeners={{
                    onChange: ({ value }) => autoSlug.onSlugChange(value),
                  }}
                >
                  {(field) => (
                    <div className="flex flex-col gap-2.5">
                      <field.TextInputField
                        label="Channel Address"
                        placeholder="first-baptist"
                      />
                      <Text size="xs" c="dimmed">
                        This creates your channel's web address. Auto-filled
                        from the name; edit it if you'd like. You can use
                        letters, numbers, dashes (-), and underscores (_). For
                        example: "first-baptist" or "pastor-john"
                      </Text>
                    </div>
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
              </div>
            </form>
          </div>
        </div>

        <div className="md:col-span-4">
          <div className="mt-5 flex flex-col gap-5">
            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-start gap-3">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => navigate({ to: '/dashboard/channels' })}
              >
                Cancel
              </Button>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button
                    size="sm"
                    className="flex-1"
                    loading={isSubmitting}
                    onClick={() => form.handleSubmit()}
                  >
                    Create Channel
                  </Button>
                )}
              </form.Subscribe>
            </div>

            {/* Avatar Section */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Tooltip
                label="Click or drop image to add channel avatar"
                position="bottom"
              >
                <div className="relative" style={{ width: 120, height: 120 }}>
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
                    disabled={isProcessingAvatar}
                    style={{
                      borderRadius: '50%',
                      padding: 0,
                      border: 'none',
                      overflow: 'hidden',
                      cursor: 'pointer',
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
                    className="h-[120px] w-[120px]"
                  >
                    <div className="relative h-full w-full">
                      {avatarPreviewUrl ? (
                        <img
                          src={avatarPreviewUrl ?? undefined}
                          alt="Channel avatar"
                          className="h-full w-full"
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          className="bg-gray-100 dark:bg-zinc-800"
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <IconPhoto size={32} stroke={1.5} color="#adb5bd" />
                        </div>
                      )}

                      <div
                        className="dropzone-overlay absolute inset-0"
                        style={{
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: isProcessingAvatar ? 1 : 0,
                          transition: 'opacity 0.2s ease',
                          pointerEvents: 'none',
                        }}
                      >
                        {isProcessingAvatar ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '100%',
                              height: '100%',
                            }}
                          >
                            <Loader size="md" color="white" />
                          </div>
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
                      </div>
                    </div>
                  </Dropzone>

                  {newAvatarFile && (
                    <ActionIcon
                      className="absolute"
                      size="sm"
                      variant="filled"
                      color="dark"
                      onClick={resetDroppedAvatar}
                      style={{ top: 4, right: 4, zIndex: 10 }}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  )}

                  {avatarPreviewUrl && !isProcessingAvatar && (
                    <Text
                      size="xs"
                      c="dimmed"
                      style={{ textAlign: 'center' }}
                      className="mt-[4px]"
                    >
                      New avatar
                    </Text>
                  )}
                </div>
              </Tooltip>
            </div>

            {/* Default Thumbnail Section */}
            <div className="flex flex-col gap-2.5">
              <Text fw={500} size="sm">
                Default Thumbnail
              </Text>
              <Text size="xs" c="dimmed">
                This thumbnail will be used for uploads in this channel that
                don't have their own thumbnail.
              </Text>
              <Tooltip
                label="Click or drop image to add default thumbnail"
                position="bottom"
              >
                <div className="relative" style={{ width: 320, height: 180 }}>
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
                    disabled={isProcessingThumbnail}
                    style={{
                      borderRadius: 4,
                      padding: 0,
                      border: 'none',
                      overflow: 'hidden',
                      cursor: 'pointer',
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
                    className="h-[180px] w-[320px]"
                  >
                    <div className="relative h-full w-full">
                      {thumbnailPreviewUrl ? (
                        <img
                          src={thumbnailPreviewUrl ?? undefined}
                          alt="Channel default thumbnail"
                          className="h-full w-full"
                          style={{ objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          className="bg-gray-100 dark:bg-zinc-800"
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <IconPhoto size={32} stroke={1.5} color="#adb5bd" />
                        </div>
                      )}

                      <div
                        className="dropzone-overlay absolute inset-0"
                        style={{
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: isProcessingThumbnail ? 1 : 0,
                          transition: 'opacity 0.2s ease',
                          pointerEvents: 'none',
                        }}
                      >
                        {isProcessingThumbnail ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '100%',
                              height: '100%',
                            }}
                          >
                            <Loader size="md" color="white" />
                          </div>
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
                      </div>
                    </div>
                  </Dropzone>

                  {newThumbnailFile && (
                    <ActionIcon
                      className="absolute"
                      size="sm"
                      variant="filled"
                      color="dark"
                      onClick={resetDroppedThumbnail}
                      style={{ top: 4, right: 4, zIndex: 10 }}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  )}

                  {thumbnailPreviewUrl && !isProcessingThumbnail && (
                    <Text
                      size="xs"
                      c="dimmed"
                      style={{ textAlign: 'center' }}
                      className="mt-[4px]"
                    >
                      New thumbnail
                    </Text>
                  )}
                </div>
              </Tooltip>
            </div>

            {/* Visibility Settings */}
            <div className="flex flex-col gap-4">
              <Text fw={500} size="sm">
                Visibility
              </Text>
              <form.AppField name="visibility">
                {(field) => (
                  <field.RadioGroupField>
                    <div className="flex flex-col gap-3">
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
                    </div>
                  </field.RadioGroupField>
                )}
              </form.AppField>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
