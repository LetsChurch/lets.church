import {
  Button,
  Container,
  Group,
  LoadingOverlay,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useAppMantineForm } from '@/components/mantine';
import { useTRPC } from '@/trpc/react';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/churches_/new')({
  component: CreateChurchPage,
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

    // Group tags by category
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

    // Convert to Mantine's expected format
    return Object.entries(groupedData).map(([group, items]) => ({
      group,
      items,
    }));
  };

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

  const form = useAppMantineForm({
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      websiteUrl: '',
      primaryEmail: '',
      primaryPhoneNumber: '',
      tags: [] as string[],
    },
    onSubmit: async ({ value }) => {
      // The validation happens server-side via the TRPC schema
      createMutation.mutate(value);
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
            <Title order={1}>Add Church</Title>
            <Text c="dimmed" size="sm">
              Create a new church profile
            </Text>
          </div>
        </Group>

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

            <form.AppField name="websiteUrl">
              {(field) => (
                <field.TextInputField
                  label="Website URL"
                  placeholder="https://www.yourchurch.org"
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

            <Group justify="flex-end" mt="md">
              <Button
                variant="outline"
                onClick={() =>
                  navigate({
                    to: '/dashboard/churches',
                  })
                }
              >
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Add Church
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
