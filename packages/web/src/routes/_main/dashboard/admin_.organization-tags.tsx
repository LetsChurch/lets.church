import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

import { LcModal, ModalHeader } from '@/components/lc-modal';
import { ActionIcon, Badge, Button, Table, Text, Title } from '@/components/ui';
import { useAppForm } from '@/components/ui/form';
import { notifications } from '@/components/ui/notifications';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute(
  '/_main/dashboard/admin_/organization-tags',
)({
  component: OrganizationTagsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }

    const currentUser = await context.queryClient.fetchQuery(
      context.trpc.common.getCurrentUser.queryOptions(),
    );

    if (currentUser.role !== 'ADMIN') {
      throw redirect({ to: '/dashboard' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.admin.getOrganizationTags.queryOptions(),
    );
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
});

type OrganizationTagCategory =
  | 'DENOMINATION'
  | 'DOCTRINE'
  | 'ESCHATOLOGY'
  | 'CONFESSION'
  | 'WORSHIP'
  | 'GOVERNMENT'
  | 'OTHER';

type OrganizationTagColor =
  | 'GRAY'
  | 'RED'
  | 'YELLOW'
  | 'GREEN'
  | 'BLUE'
  | 'INDIGO'
  | 'PURPLE'
  | 'PINK';

type OrganizationTag = {
  slug: string;
  label: string;
  description?: string | null;
  category: OrganizationTagCategory;
  color: OrganizationTagColor;
};

type FormData = {
  slug: string;
  label: string;
  description: string;
  category: OrganizationTagCategory;
  color: OrganizationTagColor;
};

const CATEGORY_OPTIONS = [
  { value: 'DENOMINATION', label: 'Denomination' },
  { value: 'DOCTRINE', label: 'Doctrine' },
  { value: 'ESCHATOLOGY', label: 'Eschatology' },
  { value: 'CONFESSION', label: 'Confession' },
  { value: 'WORSHIP', label: 'Worship' },
  { value: 'GOVERNMENT', label: 'Government' },
  { value: 'OTHER', label: 'Other' },
] as const;

const COLOR_OPTIONS = [
  { value: 'GRAY', label: 'Gray' },
  { value: 'RED', label: 'Red' },
  { value: 'YELLOW', label: 'Yellow' },
  { value: 'GREEN', label: 'Green' },
  { value: 'BLUE', label: 'Blue' },
  { value: 'INDIGO', label: 'Indigo' },
  { value: 'PURPLE', label: 'Purple' },
  { value: 'PINK', label: 'Pink' },
] as const;

const COLOR_MAP: Record<OrganizationTagColor, string> = {
  GRAY: 'gray',
  RED: 'red',
  YELLOW: 'yellow',
  GREEN: 'green',
  BLUE: 'blue',
  INDIGO: 'indigo',
  PURPLE: 'purple',
  PINK: 'pink',
} as const;

const TABLE_COLUMN_WIDTHS = {
  TAG: 200,
  SLUG: 200,
  DESCRIPTION: 300,
  ACTIONS: 120,
} as const;

const getBadgeColor = (color: OrganizationTagColor) => {
  return COLOR_MAP[color] || COLOR_MAP.GRAY;
};

function OrganizationTagsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [editingTag, setEditingTag] = useState<OrganizationTag | null>(null);

  const { data: tags } = useSuspenseQuery(
    trpc.dashboard.admin.getOrganizationTags.queryOptions(),
  );

  const form = useAppForm({
    defaultValues: {
      slug: '',
      label: '',
      description: '',
      category: '' as OrganizationTagCategory,
      color: '' as OrganizationTagColor,
    } as FormData,
    onSubmit: async ({ value }) => {
      upsertTagMutation.mutate({
        slug: value.slug,
        label: value.label,
        description: value.description || undefined,
        category: value.category,
        color: value.color,
      });
    },
  });

  const upsertTagMutation = useMutation(
    trpc.dashboard.admin.upsertOrganizationTag.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: `Organization tag ${editingTag ? 'updated' : 'created'} successfully`,
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getOrganizationTags.queryKey(),
        });
        close();
        form.reset();
        setEditingTag(null);
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: `Failed to ${editingTag ? 'update' : 'create'} organization tag`,
          color: 'red',
        });
      },
    }),
  );

  const deleteTagMutation = useMutation(
    trpc.dashboard.admin.deleteOrganizationTag.mutationOptions({
      onSuccess: () => {
        notifications.show({
          title: 'Success',
          message: 'Organization tag deleted successfully',
          color: 'green',
        });
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getOrganizationTags.queryKey(),
        });
      },
      onError: () => {
        notifications.show({
          title: 'Error',
          message: 'Failed to delete organization tag',
          color: 'red',
        });
      },
    }),
  );

  const handleEdit = (tag: OrganizationTag) => {
    setEditingTag(tag);
    form.setFieldValue('slug', tag.slug);
    form.setFieldValue('label', tag.label);
    form.setFieldValue('description', tag.description || '');
    form.setFieldValue('category', tag.category);
    form.setFieldValue('color', tag.color);
    open();
  };

  const handleCreate = () => {
    setEditingTag(null);
    form.reset();
    open();
  };

  const handleDelete = (tagSlug: string) => {
    deleteTagMutation.mutate({ slug: tagSlug });
  };

  const groupedTags = tags.reduce(
    (acc, tag) => {
      if (!acc[tag.category]) {
        acc[tag.category] = [];
      }
      acc[tag.category].push(tag);
      return acc;
    },
    {} as Record<OrganizationTagCategory, OrganizationTag[]>,
  );

  return (
    <div className="w-full">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Title order={1} className="mb-2.5">
              Organization Tags
            </Title>
            <Text c="dimmed" size="sm">
              Manage organization tags used for categorizing churches and
              organizations
            </Text>
          </div>
          <Button leftSection={<IconPlus size={16} />} onClick={handleCreate}>
            Add Tag
          </Button>
        </div>

        {Object.entries(groupedTags).map(([category, categoryTags]) => (
          <div key={category}>
            <Title order={2} className="mb-4 text-xl font-semibold">
              {CATEGORY_OPTIONS.find((opt) => opt.value === category)?.label ||
                category}
            </Title>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: TABLE_COLUMN_WIDTHS.TAG }}>
                    Tag
                  </Table.Th>
                  <Table.Th style={{ width: TABLE_COLUMN_WIDTHS.SLUG }}>
                    Slug
                  </Table.Th>
                  <Table.Th style={{ width: TABLE_COLUMN_WIDTHS.DESCRIPTION }}>
                    Description
                  </Table.Th>
                  <Table.Th style={{ width: TABLE_COLUMN_WIDTHS.ACTIONS }}>
                    Actions
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {categoryTags
                  .sort((a, b) => a.slug.localeCompare(b.slug))
                  .map((tag) => (
                    <Table.Tr key={tag.slug}>
                      <Table.Td style={{ width: TABLE_COLUMN_WIDTHS.TAG }}>
                        <Badge
                          color={getBadgeColor(tag.color)}
                          variant="light"
                          size="sm"
                        >
                          {tag.label}
                        </Badge>
                      </Table.Td>
                      <Table.Td style={{ width: TABLE_COLUMN_WIDTHS.SLUG }}>
                        <Text size="sm" c="dimmed">
                          {tag.slug}
                        </Text>
                      </Table.Td>
                      <Table.Td
                        style={{ width: TABLE_COLUMN_WIDTHS.DESCRIPTION }}
                      >
                        <Text size="sm">{tag.description || '-'}</Text>
                      </Table.Td>
                      <Table.Td style={{ width: TABLE_COLUMN_WIDTHS.ACTIONS }}>
                        <div className="flex flex-wrap items-center justify-start gap-2.5">
                          <ActionIcon
                            color="blue"
                            variant="light"
                            size="sm"
                            onClick={() => handleEdit(tag)}
                            aria-label="Edit tag"
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                          <ActionIcon
                            color="red"
                            variant="light"
                            size="sm"
                            onClick={() => handleDelete(tag.slug)}
                            loading={
                              deleteTagMutation.isPending &&
                              deleteTagMutation.variables?.slug === tag.slug
                            }
                            aria-label="Delete tag"
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </div>
                      </Table.Td>
                    </Table.Tr>
                  ))}
              </Table.Tbody>
            </Table>
          </div>
        ))}

        <LcModal.Root
          open={opened}
          onOpenChange={(o) => {
            if (!o) close();
          }}
        >
          <LcModal.Portal>
            <LcModal.Backdrop />
            <LcModal.Popup size="md">
              <ModalHeader
                title={
                  editingTag
                    ? 'Edit Organization Tag'
                    : 'Create Organization Tag'
                }
              />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  form.handleSubmit();
                }}
                method="post"
              >
                <div className="flex flex-col gap-4">
                  <form.AppField name="slug">
                    {(field) => (
                      <field.TextInputField
                        label="Slug"
                        placeholder="e.g., reformed-baptist"
                        required
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="label">
                    {(field) => (
                      <field.TextInputField
                        label="Label"
                        placeholder="e.g., Reformed Baptist"
                        required
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="description">
                    {(field) => (
                      <field.TextInputField
                        label="Description"
                        placeholder="Optional description"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="category">
                    {(field) => (
                      <field.SelectField
                        label="Category"
                        required
                        data={CATEGORY_OPTIONS}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="color">
                    {(field) => (
                      <field.SelectField
                        label="Color"
                        required
                        data={COLOR_OPTIONS}
                      />
                    )}
                  </form.AppField>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <Button variant="outline" onClick={close}>
                      Cancel
                    </Button>
                    <Button type="submit" loading={upsertTagMutation.isPending}>
                      {editingTag ? 'Update' : 'Create'}
                    </Button>
                  </div>
                </div>
              </form>
            </LcModal.Popup>
          </LcModal.Portal>
        </LcModal.Root>
      </div>
    </div>
  );
}
