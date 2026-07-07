import { IconPhoto, IconUpload, IconX } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';

import {
  ActionIcon,
  Button,
  Loader,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { Dropzone } from '@/components/ui/dropzone';
import { useAppForm } from '@/components/ui/form';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { profileUpdateSchema } from '@/schemas/account';
import { trpcClient, useTRPC } from '@/trpc/react';
import { preloadImage } from '@/util/image-preload';
import { doMultipartUpload } from '@/util/multipart-upload';

export const Route = createFileRoute('/_main/dashboard/account_/profile')({
  component: ProfilePage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.account.getProfile.queryOptions(),
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

  const profileQuery = useSuspenseQuery(trpc.account.getProfile.queryOptions());

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

  const form = useAppForm({
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

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
        <div className="md:col-span-8">
          <div className="flex flex-col gap-5">
            <Title order={1}>Profile Information</Title>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <div className="flex flex-col gap-4">
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
              </div>
            </form>
          </div>
        </div>

        <div className="md:col-span-4">
          <div className="mt-5 flex flex-col gap-5">
            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-start gap-3">
              <form.Subscribe
                selector={(state) => ({
                  isSubmitting: state.isSubmitting,
                  isDirty: state.isDirty,
                  isValid: state.isValid,
                })}
              >
                {({ isSubmitting, isDirty, isValid }) => (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
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
                      className="flex-1"
                      disabled={(!isDirty && !newAvatarFile) || !isValid}
                      loading={isSubmitting}
                      onClick={() => form.handleSubmit()}
                    >
                      Save Changes
                    </Button>
                  </>
                )}
              </form.Subscribe>
            </div>

            {/* Avatar Section */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Tooltip
                label="Click or drop image to change avatar"
                withArrow
                position="bottom"
              >
                {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- hover-only affordance revealing the upload overlay; the file input is the real control */}
                <div
                  className="relative size-30"
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
                    accept={['image/*']}
                    disabled={isProcessingAvatar}
                    style={{
                      borderRadius: '50%',
                      padding: 0,
                      border: 'none',
                      overflow: 'hidden',
                      cursor: 'pointer',
                    }}
                    className="h-[120px] w-[120px]"
                  >
                    <div className="relative h-full w-full">
                      {profileQuery.data.avatarUrl || previewUrl ? (
                        <img
                          src={
                            previewUrl ||
                            profileQuery.data.avatarUrl ||
                            undefined
                          }
                          alt="User avatar"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-zinc-800">
                          <IconPhoto size={32} stroke={1.5} color="#9ca3af" />
                        </div>
                      )}

                      <div
                        className="dropzone-overlay absolute inset-0 flex items-center justify-center bg-black/50"
                        style={{
                          opacity: isProcessingAvatar ? 1 : 0,
                          transition: 'opacity 0.2s ease',
                          pointerEvents: 'none',
                        }}
                      >
                        {isProcessingAvatar ? (
                          <div className="flex h-full w-full items-center justify-center">
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
                      size="sm"
                      variant="filled"
                      color="gray"
                      onClick={resetDroppedAvatar}
                      className="absolute top-1 right-1 z-10"
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  )}

                  {previewUrl && !isProcessingAvatar && (
                    <Text size="xs" c="dimmed" ta="center" className="mt-[4px]">
                      New avatar
                    </Text>
                  )}
                </div>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
