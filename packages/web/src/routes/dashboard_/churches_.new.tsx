import {
  ActionIcon,
  Box,
  Button,
  Container,
  Grid,
  Group,
  Image,
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
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { AddressFields } from '@/components/address-fields';
import { useAppMantineForm } from '@/components/mantine';
import { showFailure, showSuccess } from '@/routes/-mantine';
import { OrganizationAutocomplete } from '@/routes/dashboard_/-components/organization-autocomplete';
import { trpcClient, useTRPC } from '@/trpc/react';
import { doMultipartUpload } from '@/util/multipart-upload';

export const Route = createFileRoute('/dashboard_/churches_/new')({
  component: CreateChurchPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async () => {
    return {
      backNavigation: {
        label: 'Churches',
        to: '/dashboard/churches',
      },
    };
  },
});

function CreateChurchPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: organizationTags = [] } = useSuspenseQuery(
    trpc.dashboard.churches.getOrganizationTags.queryOptions(),
  );

  const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const resetDroppedAvatar = useCallback(() => {
    if (previewUrl) {
      setPreviewUrl((previewUrl) => {
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        return null;
      });
      setNewAvatarFile(null);
    }
  }, [previewUrl]);

  const createMutation = useMutation(
    trpc.dashboard.churches.createChurch.mutationOptions({
      onSuccess: async (data) => {
        showSuccess({
          message: 'Church created successfully!',
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.churches.getChurches.queryKey(),
        });

        navigate({
          to: '/dashboard/churches/$churchId',
          params: { churchId: data.id },
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to add church',
        });
      },
    }),
  );

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

  const form = useAppMantineForm({
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      websiteUrl: '',
      primaryEmail: '',
      primaryPhoneNumber: '',
      tags: [] as string[],
      associatedOrganizations: [] as string[],
      addresses: [] as Array<{
        type: 'MAILING' | 'MEETING' | 'OFFICE' | 'OTHER';
        name: string | null;
        streetAddress: string | null;
        locality: string | null;
        region: string | null;
        postalCode: string | null;
        country: string | null;
        postOfficeBoxNumber: string | null;
      }>,
    },
    onSubmit: async ({ value }) => {
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
      const church = await createMutation.mutateAsync(transformedValue);

      if (newAvatarFile && church.id) {
        const mpu =
          await trpcClient.dashboard.churches.createMultipartUpload.mutate({
            churchId: church.id,
            targetId: church.id,
            uploadMimeType: newAvatarFile.type,
            bytes: newAvatarFile.size,
          });

        const uploadPromise = doMultipartUpload(
          newAvatarFile,
          mpu.urls,
          mpu.partSize,
        );

        await trpcClient.dashboard.churches.finalizeMultipartUpload.mutate({
          churchId: church.id,
          s3UploadKey: mpu.s3UploadKey,
          s3UploadId: mpu.s3UploadId,
          s3PartETags: await uploadPromise,
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
            <Title order={1}>Add Church</Title>
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

                <form.AppField name="slug">
                  {(field) => (
                    <field.TextInputField
                      label="Slug"
                      placeholder="url-safe-identifier (leave empty to auto-generate)"
                    />
                  )}
                </form.AppField>

                <form.AppField name="description">
                  {(field) => (
                    <field.TextareaField
                      label="Description"
                      placeholder="Describe your church"
                      minRows={4}
                      maxRows={8}
                      autosize
                    />
                  )}
                </form.AppField>

                <AddressFields form={form} />
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
                onClick={() => navigate({ to: '/dashboard/churches' })}
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
                    Add Church
                  </Button>
                )}
              </form.Subscribe>
            </Group>

            {/* Avatar Section */}
            <Group gap="md" justify="center">
              {previewUrl ? (
                <Box pos="relative" w={120} h={120}>
                  <Image
                    src={previewUrl}
                    alt="Church avatar"
                    w={120}
                    h={120}
                    style={{ objectFit: 'cover', borderRadius: '50%' }}
                  />
                  <ActionIcon
                    pos="absolute"
                    top={4}
                    right={4}
                    size="sm"
                    variant="filled"
                    color="dark"
                    onClick={resetDroppedAvatar}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                  <Text
                    size="xs"
                    c="dimmed"
                    mt={4}
                    style={{ textAlign: 'center' }}
                  >
                    Church avatar
                  </Text>
                </Box>
              ) : null}
              <Tooltip label="Add church avatar" withArrow position="bottom">
                <div>
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
                    w={120}
                    h={120}
                    style={{
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div style={{ pointerEvents: 'none' }}>
                      <Dropzone.Accept>
                        <IconUpload size={32} stroke={1.5} />
                      </Dropzone.Accept>
                      <Dropzone.Reject>
                        <IconX size={32} stroke={1.5} />
                      </Dropzone.Reject>
                      <Dropzone.Idle>
                        <IconPhoto size={32} stroke={1.5} />
                      </Dropzone.Idle>
                    </div>
                  </Dropzone>
                </div>
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
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
