import { IconPhoto, IconUpload, IconX } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';

import { AddressFields } from '@/components/address-fields';
import {
  ActionIcon,
  Button,
  Loader,
  LoadingOverlay,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { Dropzone } from '@/components/ui/dropzone';
import { useAppForm } from '@/components/ui/form';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { OrganizationAutocomplete } from '@/routes/_main/dashboard/-components/organization-autocomplete';
import { trpcClient, useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { preloadImage } from '@/util/image-preload';
import { doMultipartUpload } from '@/util/multipart-upload';

export const Route = createFileRoute(
  '/_main/dashboard/churches_/$churchId_/edit',
)({
  component: ChurchEditPage,
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
      trpc.dashboard.churches.getChurchForEdit.queryOptions({
        churchId: params.churchId,
      }),
    );
    return {
      backNavigation: {
        label: 'Back to church',
        to: '/dashboard/churches/$churchId',
        params: { churchId: params.churchId },
      },
    };
  },
});

function ChurchEditPage() {
  const { churchId } = Route.useParams();
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: church } = useSuspenseQuery(
    trpc.dashboard.churches.getChurchForEdit.queryOptions({
      churchId,
    }),
  );

  const { data: organizationTags = [] } = useSuspenseQuery(
    trpc.dashboard.churches.getOrganizationTags.queryOptions(),
  );

  const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [avatarUrlBeforeUpload, setAvatarUrlBeforeUpload] = useState<
    string | null
  >(null);

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
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurchForEdit.queryKey({
            churchId,
          }),
        });
        const currentAvatarUrl = church?.avatarUrl;

        if (currentAvatarUrl !== avatarUrlBeforeUpload) {
          if (currentAvatarUrl) {
            try {
              await preloadImage(currentAvatarUrl);
              setIsProcessingAvatar(false);
              setAvatarUrlBeforeUpload(null);
              resetDroppedAvatar();
              showSuccess({
                title: 'Avatar Updated',
                message: 'Church avatar has been processed successfully!',
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
              message: 'Church avatar has been removed successfully!',
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
    church?.avatarUrl,
    queryClient,
    churchId,
    trpc.dashboard.churches.getChurchForEdit,
    resetDroppedAvatar,
  ]);

  const updateChurchMutation = useMutation(
    trpc.dashboard.churches.updateChurch.mutationOptions({
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
            message: 'Church updated successfully!',
          });
          resetDroppedAvatar();
        }

        await queryClient.invalidateQueries(
          trpc.dashboard.churches.pathFilter(),
        );

        await router.navigate({
          to: '/dashboard/churches/$churchId',
          params: { churchId },
        });
      },
      onError: () => {
        showFailure({
          title: 'Error',
          message: 'Error updating church, please try again!',
        });
      },
    }),
  );

  const form = useAppForm({
    defaultValues: {
      name: church.name || '',
      description: church.description || '',
      websiteUrl: church.websiteUrl || '',
      primaryEmail: church.primaryEmail || '',
      primaryPhoneNumber: church.primaryPhoneNumber || '',
      tags: church.tags || [],
      associatedOrganizations: church.associatedOrganizations || [],
      addresses: church.addresses || [],
      facebookUrl: church.facebookUrl || '',
      instagramUrl: church.instagramUrl || '',
      xUrl: church.xUrl || '',
      youtubeUrl: church.youtubeUrl || '',
      tiktokUrl: church.tiktokUrl || '',
      linkedinUrl: church.linkedinUrl || '',
      threadsUrl: church.threadsUrl || '',
      applePodcastsUrl: church.applePodcastsUrl || '',
      spotifyUrl: church.spotifyUrl || '',
      rssUrl: church.rssUrl || '',
    },
    onSubmit: async ({ value }) => {
      if (newAvatarFile) {
        setAvatarUrlBeforeUpload(church?.avatarUrl || null);

        const mpu =
          await trpcClient.dashboard.churches.createMultipartUpload.mutate({
            churchId,
            targetId: churchId,
            uploadMimeType: newAvatarFile.type,
            bytes: newAvatarFile.size,
          });

        const uploadPromise = doMultipartUpload(
          newAvatarFile,
          mpu.urls,
          mpu.partSize,
        );

        await trpcClient.dashboard.churches.finalizeMultipartUpload.mutate({
          churchId,
          s3UploadKey: mpu.s3UploadKey,
          s3UploadId: mpu.s3UploadId,
          s3PartETags: await uploadPromise,
        });

        setIsProcessingAvatar(true);
      }

      // Transform addresses to convert null to undefined for Zod schema compatibility
      const transformedValue = {
        ...value,
        addresses: value.addresses.map((address) => ({
          type: address.type,
          name: address.name ?? undefined,
          streetAddress: address.streetAddress ?? undefined,
          locality: address.locality ?? undefined,
          region: address.region ?? undefined,
          postalCode: address.postalCode ?? undefined,
          country: address.country ?? undefined,
          postOfficeBoxNumber: address.postOfficeBoxNumber ?? undefined,
        })),
      };

      updateChurchMutation.mutate({
        ...transformedValue,
        churchId,
      });
    },
  });

  const getGroupedTags = () => {
    const groups: { [key: string]: string } = {
      DENOMINATION: 'Denomination',
      DOCTRINE: 'Doctrine',
      ESCHATOLOGY: 'Eschatology',
      CONFESSION: 'Confession',
      WORSHIP: 'Worship',
      GOVERNMENT: 'Church Government',
      OTHER: 'Other Distinctives',
    };

    const groupedData: {
      [key: string]: Array<{ value: string; label: string }>;
    } = {};

    organizationTags.forEach((tag) => {
      const groupName = groups[tag.category] || tag.category;
      if (!groupedData[groupName]) {
        groupedData[groupName] = [];
      }
      groupedData[groupName].push({
        value: tag.slug,
        label: tag.label,
      });
    });

    return Object.entries(groupedData).map(([group, items]) => ({
      group,
      items,
    }));
  };

  return (
    <div className="relative mx-auto w-full max-w-7xl px-4 py-4">
      <LoadingOverlay visible={updateChurchMutation.isPending} />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="flex flex-col gap-5">
            <Title order={1}>Edit Church</Title>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <div className="flex flex-col gap-4">
                <form.AppField name="name">
                  {(field) => (
                    <field.TextInputField
                      label="Church Name (required)"
                      placeholder="Enter church name"
                      required
                    />
                  )}
                </form.AppField>

                <form.AppField name="description">
                  {(field) => (
                    <field.TextareaField
                      label="Description"
                      placeholder="Describe your church"
                      minRows={3}
                      maxRows={6}
                    />
                  )}
                </form.AppField>

                <AddressFields form={form} />

                <Title order={3} className="mt-5">
                  Social Media Links
                </Title>

                <div className="grid grid-cols-2 gap-4">
                  <form.AppField name="facebookUrl">
                    {(field) => (
                      <field.TextInputField
                        label="Facebook URL"
                        placeholder="https://facebook.com/yourchurch"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="instagramUrl">
                    {(field) => (
                      <field.TextInputField
                        label="Instagram URL"
                        placeholder="https://instagram.com/yourchurch"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="xUrl">
                    {(field) => (
                      <field.TextInputField
                        label="X (Twitter) URL"
                        placeholder="https://x.com/yourchurch"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="youtubeUrl">
                    {(field) => (
                      <field.TextInputField
                        label="YouTube URL"
                        placeholder="https://youtube.com/@yourchurch"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="tiktokUrl">
                    {(field) => (
                      <field.TextInputField
                        label="TikTok URL"
                        placeholder="https://tiktok.com/@yourchurch"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="linkedinUrl">
                    {(field) => (
                      <field.TextInputField
                        label="LinkedIn URL"
                        placeholder="https://linkedin.com/company/yourchurch"
                        type="url"
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="threadsUrl">
                    {(field) => (
                      <field.TextInputField
                        label="Threads URL"
                        placeholder="https://threads.net/@yourchurch"
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
                        placeholder="https://yourchurch.com/feed.xml"
                        type="url"
                      />
                    )}
                  </form.AppField>
                </div>
              </div>
            </form>
          </div>
        </div>

        <div className="md:col-span-1">
          <div className="mt-5 flex flex-col gap-5">
            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-start gap-3">
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
                      disabled={!isDirty && !newAvatarFile}
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
                <div className="group relative size-30">
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
                    className="h-[120px] w-[120px] overflow-hidden rounded-full border-0 p-0"
                  >
                    <div className="relative size-full">
                      {church.avatarUrl || previewUrl ? (
                        <img
                          src={previewUrl || church.avatarUrl || undefined}
                          alt="Church avatar"
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-gray-100 dark:bg-zinc-800">
                          <IconPhoto
                            size={32}
                            stroke={1.5}
                            className="text-gray-400"
                          />
                        </div>
                      )}

                      <div
                        className={cn(
                          'absolute inset-0 flex items-center justify-center transition-opacity duration-200',
                          isProcessingAvatar
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100',
                        )}
                        style={{
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          pointerEvents: 'none',
                        }}
                      >
                        {isProcessingAvatar ? (
                          <div className="flex size-full items-center justify-center">
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
                      color="dark"
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

            {/* Contact Information */}
            <div className="flex flex-col gap-4">
              <form.AppField name="websiteUrl">
                {(field) => (
                  <field.TextInputField
                    label="Website URL"
                    placeholder="https://www.yourchurch.org"
                    type="url"
                  />
                )}
              </form.AppField>

              <form.AppField name="primaryEmail">
                {(field) => (
                  <field.TextInputField
                    label="Primary Email"
                    placeholder="contact@yourchurch.org"
                    type="email"
                  />
                )}
              </form.AppField>

              <form.AppField name="primaryPhoneNumber">
                {(field) => (
                  <field.TextInputField
                    label="Primary Phone Number"
                    placeholder="+1 (555) 123-4567"
                    type="tel"
                  />
                )}
              </form.AppField>

              <form.AppField name="tags" mode="array">
                {(field) => (
                  <field.MultiSelectField
                    label="Tags"
                    placeholder="Search and select tags"
                    data={getGroupedTags()}
                    searchable
                    description="Select tags for Denomination, Doctrine, Eschatology, Confession, Worship, Church Government, and Other Distinctives"
                  />
                )}
              </form.AppField>

              <form.AppField name="associatedOrganizations" mode="array">
                {(field) => (
                  <OrganizationAutocomplete
                    label="Associated Organizations"
                    placeholder="Search organizations to add..."
                    excludeChurchTypes={true}
                    description="Search and add organizations that this church is associated with"
                    value={field.state.value || []}
                    onChange={field.handleChange}
                    error={field.state.meta.errors?.[0]}
                  />
                )}
              </form.AppField>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
