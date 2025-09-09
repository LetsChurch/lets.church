import {
  ActionIcon,
  Box,
  Button,
  Container,
  Grid,
  Group,
  Image,
  Loader,
  LoadingOverlay,
  Radio,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { IconPhoto, IconUpload, IconX } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useAppMantineForm } from '@/components/mantine';
import { showFailure, showSuccess } from '@/routes/-mantine';
import { trpcClient, useTRPC } from '@/trpc/react';
import { preloadImage } from '@/util/image-preload';
import { doMultipartUpload } from '@/util/multipart-upload';

export const Route = createFileRoute('/dashboard_/channels_/new')({
  component: CreateChannelPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async () => {
    return {
      backNavigation: {
        label: 'My Channels',
        to: '/dashboard/channels',
      },
    };
  },
});

function CreateChannelPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [avatarUrlBeforeUpload, setAvatarUrlBeforeUpload] = useState<
    string | null
  >(null);
  const [createdChannelId, setCreatedChannelId] = useState<string | null>(null);

  const resetDroppedAvatar = useCallback(() => {
    setPreviewUrl((previewUrl) => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      return null;
    });
    setNewAvatarFile(null);
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

              // Navigate to the channel page
              navigate({
                to: '/dashboard/channels/$channelId',
                params: { channelId: createdChannelId },
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

              // Navigate to the channel page even if preload failed
              navigate({
                to: '/dashboard/channels/$channelId',
                params: { channelId: createdChannelId },
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

            // Navigate to the channel page
            navigate({
              to: '/dashboard/channels/$channelId',
              params: { channelId: createdChannelId },
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
    resetDroppedAvatar, // Navigate to the channel page
    navigate,
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

  const form = useAppMantineForm({
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
      } else {
        // No avatar to process, navigate immediately
        navigate({
          to: '/dashboard/channels/$channelId',
          params: { channelId: channel.id },
        });
      }
    },
  });

  return (
    <Container size="xl" py="md" pos="relative">
      <LoadingOverlay visible={createMutation.isPending} />

      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            <Title order={1}>Create Channel</Title>
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
              </Stack>
            </form>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="lg" mt="lg">
            {/* Action Buttons */}
            <Group gap="sm">
              <Button
                variant="outline"
                size="sm"
                flex={1}
                onClick={() => navigate({ to: '/dashboard/channels' })}
              >
                Cancel
              </Button>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button
                    size="sm"
                    flex={1}
                    loading={isSubmitting}
                    onClick={() => form.handleSubmit()}
                  >
                    Create Channel
                  </Button>
                )}
              </form.Subscribe>
            </Group>

            {/* Avatar Section */}
            <Group gap="md" justify="center">
              <Tooltip
                label="Click or drop image to add channel avatar"
                withArrow
                position="bottom"
              >
                <Box pos="relative" w={120} h={120}>
                  <Dropzone
                    onDrop={(files) => {
                      const file = files[0];
                      if (file) {
                        if (previewUrl) {
                          URL.revokeObjectURL(previewUrl);
                        }
                        const url = URL.createObjectURL(file);
                        setPreviewUrl(url);
                        setNewAvatarFile(file);
                      }
                    }}
                    maxSize={5 * 1024 ** 2}
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
                      {previewUrl ? (
                        <Image
                          src={previewUrl}
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

                  {previewUrl && !isProcessingAvatar && (
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
