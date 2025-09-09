import {
  ActionIcon,
  Box,
  Button,
  Container,
  Grid,
  Group,
  Image,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { IconPhoto, IconUpload, IconX } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useAppMantineForm } from '@/components/mantine';
import { showFailure, showSuccess } from '@/routes/-mantine';
import { profileUpdateSchema } from '@/schemas/account';
import { trpcClient, useTRPC } from '@/trpc/react';
import { preloadImage } from '@/util/image-preload';
import { doMultipartUpload } from '@/util/multipart-upload';

const queryOps = { avatarSize: { width: 120, height: 120 } };

export const Route = createFileRoute('/dashboard_/account_/profile')({
  component: ProfilePage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      return redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.account.getProfile.queryOptions(queryOps),
    );

    return {
      backNavigation: {
        label: 'Account Settings',
        to: '/dashboard/account',
      },
    };
  },
});

function ProfilePage() {
  const trpc = useTRPC();

  const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [avatarUrlBeforeUpload, setAvatarUrlBeforeUpload] = useState<
    string | null
  >(null);

  const profileQuery = useSuspenseQuery(
    trpc.account.getProfile.queryOptions(queryOps),
  );

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
    if (!isProcessingAvatar) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        await profileQuery.refetch();
        const currentAvatarUrl = profileQuery.data.avatarUrl;

        if (currentAvatarUrl !== avatarUrlBeforeUpload) {
          if (currentAvatarUrl) {
            try {
              await preloadImage(currentAvatarUrl);
              setIsProcessingAvatar(false);
              setAvatarUrlBeforeUpload(null);
              resetDroppedAvatar();
              showSuccess({
                title: 'Avatar Updated',
                message: 'Your avatar has been processed successfully!',
              });
            } catch (error) {
              console.error('Error preloading avatar image:', error);
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
              message: 'Your avatar has been removed successfully!',
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
    profileQuery,
    resetDroppedAvatar,
  ]);

  const updateProfileMutation = useMutation(
    trpc.account.updateProfile.mutationOptions({
      onSuccess: async (data) => {
        if (data.error) {
          showFailure({
            title: 'Error',
            message: data.error,
          });
          return;
        }

        // Only show success message if not processing avatar
        // (avatar processing success will be shown by the polling effect)
        if (!isProcessingAvatar) {
          showSuccess({
            title: 'Success',
            message: 'Profile updated successfully!',
          });
          resetDroppedAvatar();
        }

        await profileQuery.refetch();
      },
      onError: () => {
        showFailure({
          title: 'Error',
          message: 'Error updating profile, please try again!',
        });
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      fullName: profileQuery.data.fullName,
      email: profileQuery.data.email,
      username: profileQuery.data.username,
    },
    validators: {
      onChange: profileUpdateSchema,
    },
    onSubmit: async ({ value }) => {
      if (newAvatarFile) {
        setAvatarUrlBeforeUpload(profileQuery.data.avatarUrl);

        const mpu = await trpcClient.account.createMultipartUpload.mutate({
          targetId: profileQuery.data.id,
          uploadMimeType: newAvatarFile.type,
          bytes: newAvatarFile.size,
        });

        const uploadPromise = doMultipartUpload(
          newAvatarFile,
          mpu.urls,
          mpu.partSize,
        );

        await trpcClient.account.finalizeMultipartUpload.mutate({
          s3UploadKey: mpu.s3UploadKey,
          s3UploadId: mpu.s3UploadId,
          s3PartETags: await uploadPromise,
        });

        setIsProcessingAvatar(true);
      }

      updateProfileMutation.mutate(value);
    },
  });

  // Update form values when data loads
  form.reset({
    fullName: profileQuery.data.fullName,
    email: profileQuery.data.email,
    username: profileQuery.data.username,
  });

  return (
    <Container size="xl" py="md">
      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            <Title order={1}>Profile Information</Title>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <Stack gap="md">
                <form.AppField name="fullName">
                  {(field) => (
                    <field.TextInputField
                      label="Full Name"
                      placeholder="Enter your full name"
                    />
                  )}
                </form.AppField>

                <form.AppField name="email">
                  {(field) => (
                    <field.TextInputField
                      label="Email"
                      placeholder="your@email.com"
                      type="email"
                      required
                    />
                  )}
                </form.AppField>

                <form.AppField name="username">
                  {(field) => (
                    <field.TextInputField
                      label="Username"
                      placeholder="Your username"
                      required
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
                      disabled={!isDirty && !newAvatarFile}
                      onClick={() => {
                        form.reset();
                        resetDroppedAvatar();
                      }}
                    >
                      Undo changes
                    </Button>
                    <Button
                      size="sm"
                      flex={1}
                      disabled={!isDirty && !newAvatarFile}
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
                label="Click or drop image to change avatar"
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
                      {profileQuery.data.avatarUrl || previewUrl ? (
                        <Image
                          src={previewUrl || profileQuery.data.avatarUrl}
                          alt="User avatar"
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
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
