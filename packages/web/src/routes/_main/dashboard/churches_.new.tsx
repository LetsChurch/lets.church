import { IconPhoto, IconUpload, IconX } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

import { AddressFields } from '@/components/address-fields';
import {
  ActionIcon,
  Button,
  LoadingOverlay,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { Dropzone } from '@/components/ui/dropzone';
import { useAppForm } from '@/components/ui/form';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useAutoSlug } from '@/hooks/use-auto-slug';
import { OrganizationAutocomplete } from '@/routes/_main/dashboard/-components/organization-autocomplete';
import { trpcClient, useTRPC } from '@/trpc/react';
import { doMultipartUpload } from '@/util/multipart-upload';

export const Route = createFileRoute('/_main/dashboard/churches_/new')({
  component: CreateChurchPage,
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
      label: 'Churches',
      to: '/dashboard/churches',
    },
  }),
});

function CreateChurchPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const autoSlug = useAutoSlug();

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

  const form = useAppForm({
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
    <div className="relative mx-auto w-full max-w-7xl px-4 py-4">
      <LoadingOverlay visible={createMutation.isPending} />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="flex flex-col gap-5">
            <Title order={1}>Add Church</Title>
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
                      label="Church Name (required)"
                      placeholder="Enter church name"
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
                    <field.TextInputField
                      label="Slug"
                      placeholder="first-baptist"
                      description="Your church's web address. Auto-filled from the name; edit it if you'd like. Letters, numbers, dashes (-), and underscores (_) only."
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
              </div>
            </form>
          </div>
        </div>

        <div className="md:col-span-1">
          <div className="mt-5 flex flex-col gap-5">
            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-start gap-3">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => navigate({ to: '/dashboard/churches' })}
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
                    Add Church
                  </Button>
                )}
              </form.Subscribe>
            </div>

            {/* Avatar Section */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              {previewUrl ? (
                <div className="relative size-30">
                  <img
                    src={previewUrl}
                    alt="Church avatar"
                    className="size-30 rounded-full object-cover"
                  />
                  <ActionIcon
                    size="sm"
                    variant="filled"
                    color="dark"
                    onClick={resetDroppedAvatar}
                    className="absolute top-1 right-1"
                  >
                    <IconX size={14} />
                  </ActionIcon>
                  <Text size="xs" c="dimmed" ta="center" className="mt-[4px]">
                    Church avatar
                  </Text>
                </div>
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
                    className="h-[120px] w-[120px] rounded-full"
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
