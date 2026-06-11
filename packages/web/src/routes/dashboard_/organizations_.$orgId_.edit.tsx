import {
  Button,
  Container,
  Group,
  LoadingOverlay,
  Stack,
  Title,
} from '@mantine/core';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useAppMantineForm } from '@/components/mantine';
import { showFailure, showSuccess } from '@/routes/-mantine';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/organizations_/$orgId_/edit')(
  {
    component: OrganizationEditPage,
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
        trpc.dashboard.organizations.getOrganizationForEdit.queryOptions({
          orgId: params.orgId,
        }),
      );
      return {
        backNavigation: {
          label: 'Back to organization',
          to: '/dashboard/organizations/$orgId',
          params: { orgId: params.orgId },
        },
      };
    },
  },
);

function OrganizationEditPage() {
  const { orgId } = Route.useParams();
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: organization } = useSuspenseQuery(
    trpc.dashboard.organizations.getOrganizationForEdit.queryOptions({
      orgId,
    }),
  );

  const updateOrganizationMutation = useMutation(
    trpc.dashboard.organizations.updateOrganization.mutationOptions({
      onSuccess: async (data) => {
        if (data.error) {
          showFailure({
            title: 'Error',
            message: data.error,
          });
          return;
        }

        showSuccess({
          title: 'Success',
          message: 'Organization updated successfully!',
        });

        // Invalidate and refetch organization data
        await queryClient.invalidateQueries(
          trpc.dashboard.organizations.pathFilter(),
        );

        // Navigate back to organization details
        await router.navigate({
          to: '/dashboard/organizations/$orgId',
          params: { orgId },
        });
      },
      onError: () => {
        showFailure({
          title: 'Error',
          message: 'Error updating organization, please try again!',
        });
      },
    }),
  );

  const form = useAppMantineForm({
    defaultValues: {
      orgId,
      name: organization.name,
      description: organization.description || '',
      websiteUrl: organization.websiteUrl || '',
      primaryEmail: organization.primaryEmail || '',
      primaryPhoneNumber: organization.primaryPhoneNumber || '',
      facebookUrl: organization.facebookUrl || '',
      instagramUrl: organization.instagramUrl || '',
      xUrl: organization.xUrl || '',
      youtubeUrl: organization.youtubeUrl || '',
      tiktokUrl: organization.tiktokUrl || '',
      linkedinUrl: organization.linkedinUrl || '',
      threadsUrl: organization.threadsUrl || '',
      applePodcastsUrl: organization.applePodcastsUrl || '',
      spotifyUrl: organization.spotifyUrl || '',
      rssUrl: organization.rssUrl || '',
    },
    onSubmit: async ({ value }) => {
      updateOrganizationMutation.mutate(value);
    },
  });

  return (
    <Container size="md" py="md" pos="relative">
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => <LoadingOverlay visible={isSubmitting} />}
      </form.Subscribe>

      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>Edit Organization</Title>
          </div>
        </Group>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          method="post"
        >
          <Stack gap="lg">
            <form.AppField name="name">
              {(field) => (
                <field.TextInputField
                  label="Organization Name"
                  placeholder="Enter organization name"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="description">
              {(field) => (
                <field.TextareaField
                  label="Description"
                  placeholder="Enter organization description..."
                  minRows={3}
                  maxRows={6}
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

            <form.AppField name="primaryEmail">
              {(field) => (
                <field.TextInputField
                  label="Primary Email"
                  placeholder="contact@organization.org"
                  type="email"
                />
              )}
            </form.AppField>

            <form.AppField name="primaryPhoneNumber">
              {(field) => (
                <field.TextInputField
                  label="Primary Phone Number"
                  placeholder="(555) 123-4567"
                  type="tel"
                />
              )}
            </form.AppField>

            <Title order={3} mt="md">
              Social Media Links
            </Title>

            <form.AppField name="facebookUrl">
              {(field) => (
                <field.TextInputField
                  label="Facebook URL"
                  placeholder="https://facebook.com/yourorg"
                  type="url"
                />
              )}
            </form.AppField>

            <form.AppField name="instagramUrl">
              {(field) => (
                <field.TextInputField
                  label="Instagram URL"
                  placeholder="https://instagram.com/yourorg"
                  type="url"
                />
              )}
            </form.AppField>

            <form.AppField name="xUrl">
              {(field) => (
                <field.TextInputField
                  label="X (Twitter) URL"
                  placeholder="https://x.com/yourorg"
                  type="url"
                />
              )}
            </form.AppField>

            <form.AppField name="youtubeUrl">
              {(field) => (
                <field.TextInputField
                  label="YouTube URL"
                  placeholder="https://youtube.com/@yourorg"
                  type="url"
                />
              )}
            </form.AppField>

            <form.AppField name="tiktokUrl">
              {(field) => (
                <field.TextInputField
                  label="TikTok URL"
                  placeholder="https://tiktok.com/@yourorg"
                  type="url"
                />
              )}
            </form.AppField>

            <form.AppField name="linkedinUrl">
              {(field) => (
                <field.TextInputField
                  label="LinkedIn URL"
                  placeholder="https://linkedin.com/company/yourorg"
                  type="url"
                />
              )}
            </form.AppField>

            <form.AppField name="threadsUrl">
              {(field) => (
                <field.TextInputField
                  label="Threads URL"
                  placeholder="https://threads.net/@yourorg"
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
                  placeholder="https://yourorg.com/feed.xml"
                  type="url"
                />
              )}
            </form.AppField>

            <Group justify="flex-end" mt="md">
              <form.Subscribe selector={(state) => state.isDirty}>
                {(isDirty) => (
                  <>
                    <Button
                      variant="outline"
                      disabled={!isDirty}
                      onClick={() => form.reset()}
                    >
                      Reset
                    </Button>
                    <form.Subscribe selector={(state) => state.isSubmitting}>
                      {(isSubmitting) => (
                        <Button type="submit" loading={isSubmitting}>
                          Update Organization
                        </Button>
                      )}
                    </form.Subscribe>
                  </>
                )}
              </form.Subscribe>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
