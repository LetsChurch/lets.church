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
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useAppMantineForm } from '@/components/mantine';
import { showFailure, showSuccess } from '@/routes/-mantine';
import { OrganizationAutocomplete } from '@/routes/dashboard_/-components/organization-autocomplete';
import { trpcClient, useTRPC } from '@/trpc/react';
import { preloadImage } from '@/util/image-preload';
import { doMultipartUpload } from '@/util/multipart-upload';

export const Route = createFileRoute('/dashboard_/churches_/$churchId_/edit')({
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

        await queryClient.invalidateQueries({
          queryKey: ['dashboard', 'churches'],
        });

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

  const form = useAppMantineForm({
    defaultValues: {
      name: '',
      description: '',
      websiteUrl: '',
      primaryEmail: '',
      primaryPhoneNumber: '',
      tags: [] as string[],
      associatedOrganizations: [] as string[],
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

      updateChurchMutation.mutate({
        ...value,
        churchId,
      });
    },
  });

  // Add safety check to ensure data is loaded
  if (!church || !church.name) {
    return <LoadingOverlay visible />;
  }

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

  // Update form values when data loads
  if (church) {
    form.reset({
      name: church.name || '',
      description: church.description || '',
      websiteUrl: church.websiteUrl || '',
      primaryEmail: church.primaryEmail || '',
      primaryPhoneNumber: church.primaryPhoneNumber || '',
      tags: church.tags || [],
      associatedOrganizations: church.associatedOrganizations || [],
    });
  }

  return (
    <Container size="xl" py="md" pos="relative">
      <LoadingOverlay visible={updateChurchMutation.isPending} />

      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="lg">
            <Title order={1}>Edit Church</Title>
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
                      {church.avatarUrl || previewUrl ? (
                        <Image
                          src={previewUrl || church.avatarUrl}
                          alt="Church avatar"
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

            {/* Contact Information */}
            <Stack gap="md">
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
            </Stack>
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
