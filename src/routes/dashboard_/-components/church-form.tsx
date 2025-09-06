import { Button, Group, Stack } from '@mantine/core';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useAppMantineForm } from '@/components/mantine';
import { useTRPC } from '@/trpc/react';

type ChurchFormData = {
  churchId?: string;
  name: string;
  slug?: string;
  description: string;
  websiteUrl: string;
  primaryEmail: string;
  primaryPhoneNumber: string;
  tags: string[];
};

type ChurchFormProps = {
  mode: 'create' | 'edit';
  defaultValues: ChurchFormData;
  onSubmit: (data: ChurchFormData) => void;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
  showSlugField?: boolean;
};

export function ChurchForm({
  mode,
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  onCancel,
  showSlugField = false,
}: ChurchFormProps) {
  const trpc = useTRPC();

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
    defaultValues,
    onSubmit: async ({ value }) => {
      onSubmit(value);
    },
  });

  return (
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
              label="Church Name (required)"
              placeholder="Enter church name"
              required
            />
          )}
        </form.AppField>

        {showSlugField && (
          <form.AppField name="slug">
            {(field) => (
              <field.TextInputField
                label="Slug"
                placeholder="url-safe-identifier (leave empty to auto-generate)"
              />
            )}
          </form.AppField>
        )}

        <form.AppField name="description">
          {(field) => (
            <field.TextareaField
              label="Description"
              placeholder={
                mode === 'create'
                  ? 'Describe your church'
                  : 'Enter church description...'
              }
              minRows={mode === 'create' ? 4 : 3}
              maxRows={mode === 'create' ? 8 : 6}
              autosize={mode === 'create'}
            />
          )}
        </form.AppField>

        <form.AppField name="websiteUrl">
          {(field) => (
            <field.TextInputField
              label="Website URL"
              placeholder={
                mode === 'create'
                  ? 'https://www.yourchurch.org'
                  : 'https://example.com'
              }
              type="url"
            />
          )}
        </form.AppField>

        <form.AppField name="primaryEmail">
          {(field) => (
            <field.TextInputField
              label="Primary Email"
              placeholder={
                mode === 'create'
                  ? 'contact@yourchurch.org'
                  : 'contact@church.org'
              }
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
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {mode === 'edit' && (
            <form.Subscribe selector={(state) => state.isDirty}>
              {(isDirty) => (
                <Button
                  variant="outline"
                  disabled={!isDirty}
                  onClick={() => form.reset()}
                >
                  Reset
                </Button>
              )}
            </form.Subscribe>
          )}
          <Button type="submit" loading={isSubmitting}>
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
