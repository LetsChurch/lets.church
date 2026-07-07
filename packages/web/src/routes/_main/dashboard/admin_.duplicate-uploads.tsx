import {
  IconChevronDown,
  IconChevronRight,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Table,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { modals } from '@/components/ui/confirm-modal';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { formatDate } from '@/util/format';

export const Route = createFileRoute(
  '/_main/dashboard/admin_/duplicate-uploads',
)({
  component: RouteComponent,
  validateSearch: z.object({
    matchPublishedAt: z.boolean().default(true),
  }),
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
  loaderDeps: ({ search }) => ({ matchPublishedAt: search.matchPublishedAt }),
  loader: async ({ context: { queryClient, trpc }, deps }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.admin.getDuplicateUploads.queryOptions({
        limit: 50,
        offset: 0,
        matchPublishedAt: deps.matchPublishedAt,
      }),
    );
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
});

type Upload = {
  id: string;
  createdAt: Date;
  publishedAt: Date | null;
};

type DuplicateGroup = {
  channelId: string;
  channelName: string;
  channelSlug: string;
  title: string | null;
  publishedAt: Date | null;
  uploads: Upload[];
};

function DuplicateGroupRow({
  group,
  matchPublishedAt,
  onDelete,
  isDeleting,
}: {
  group: DuplicateGroup;
  matchPublishedAt: boolean;
  onDelete: (uploadId: string) => void;
  isDeleting: boolean;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const duplicateCount = group.uploads.length - 1;

  const confirmDelete = (uploadId: string, label: string) => {
    modals.openConfirmModal({
      title: 'Delete duplicate upload',
      children: (
        <Text size="sm">
          Are you sure you want to delete <strong>{label}</strong>? This will
          permanently remove the upload and all associated files.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => onDelete(uploadId),
    });
  };

  const confirmDeleteAll = () => {
    modals.openConfirmModal({
      title: 'Delete all duplicates',
      children: (
        <Text size="sm">
          Delete the {duplicateCount} newer cop
          {duplicateCount === 1 ? 'y' : 'ies'} of{' '}
          <strong>{group.title || 'Untitled'}</strong>
          {matchPublishedAt && group.publishedAt
            ? ` (published ${formatDate(group.publishedAt, 'short')})`
            : ''}
          , keeping only the oldest? This cannot be undone.
        </Text>
      ),
      labels: { confirm: `Delete ${duplicateCount}`, cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        for (const upload of group.uploads.slice(1)) {
          onDelete(upload.id);
        }
      },
    });
  };

  return (
    <>
      <Table.Tr
        style={{ cursor: 'pointer' }}
        onClick={toggle}
        className={cn(opened && 'bg-gray-50 dark:bg-white/5')}
      >
        <Table.Td>
          {opened ? (
            <IconChevronDown size={14} />
          ) : (
            <IconChevronRight size={14} />
          )}
        </Table.Td>
        <Table.Td>
          <Text fw={500} size="sm" lineClamp={2}>
            {group.title || (
              <Text c="dimmed" component="span" className="italic">
                Untitled
              </Text>
            )}
          </Text>
          {matchPublishedAt && group.publishedAt ? (
            <Text size="xs" c="dimmed">
              Published {formatDate(group.publishedAt, 'short')}
            </Text>
          ) : null}
        </Table.Td>
        <Table.Td>
          <Text size="sm" fw={500}>
            {group.channelName}
          </Text>
          <Text size="xs" c="dimmed">
            @{group.channelSlug}
          </Text>
        </Table.Td>
        <Table.Td>
          <Badge color="red" size="sm">
            {group.uploads.length} copies
          </Badge>
        </Table.Td>
        <Table.Td onClick={(e) => e.stopPropagation()}>
          <Button
            size="xs"
            color="red"
            variant="light"
            leftSection={<IconTrash size={12} />}
            onClick={confirmDeleteAll}
            disabled={isDeleting}
          >
            Delete {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''}
          </Button>
        </Table.Td>
      </Table.Tr>
      {opened && (
        <Table.Tr>
          <Table.Td colSpan={5} className="p-0">
            <div className="bg-gray-50 px-8 py-2.5 dark:bg-white/5">
              <Table withRowBorders={false}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Upload ID</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Published</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {group.uploads.map((upload, i) => (
                    <Table.Tr key={upload.id}>
                      <Table.Td>
                        <Text size="xs" c="dimmed" className="font-mono">
                          {upload.id}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {formatDate(upload.createdAt, 'short')}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {upload.publishedAt
                            ? formatDate(upload.publishedAt, 'short')
                            : '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {i === 0 ? (
                          <Badge color="green" size="xs" variant="light">
                            Oldest — keep
                          </Badge>
                        ) : (
                          <Tooltip label="Delete this copy">
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              size="sm"
                              onClick={() =>
                                confirmDelete(
                                  upload.id,
                                  `copy from ${formatDate(upload.createdAt, 'short')}`,
                                )
                              }
                              disabled={isDeleting}
                            >
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}

function RouteComponent() {
  const trpc = useTRPC();
  const navigate = useNavigate({ from: Route.fullPath });
  const { matchPublishedAt } = Route.useSearch();

  const { data, refetch } = useSuspenseQuery(
    trpc.dashboard.admin.getDuplicateUploads.queryOptions({
      limit: 50,
      offset: 0,
      matchPublishedAt,
    }),
  );

  const deleteMutation = useMutation(
    trpc.dashboard.admin.deleteDuplicateUpload.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Duplicate upload deleted successfully.' });
        await refetch();
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to delete upload.',
        });
      },
    }),
  );

  const handleDelete = (uploadId: string) => {
    deleteMutation.mutate({ uploadId });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Duplicate Uploads</Title>
          <Text c="dimmed">
            {data.groups.length} group{data.groups.length !== 1 ? 's' : ''} of
            duplicates
            {data.totalGroups > data.groups.length
              ? ` (showing ${data.groups.length} of ${data.totalGroups})`
              : ''}
          </Text>
        </div>
        <Checkbox
          label="Match published date"
          description="Only flag as duplicates if title and published date both match"
          checked={matchPublishedAt}
          onChange={(checked) =>
            navigate({
              search: { matchPublishedAt: checked },
            })
          }
        />
      </div>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="w-6" />
            <Table.Th>Title</Table.Th>
            <Table.Th>Channel</Table.Th>
            <Table.Th>Copies</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.groups.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text ta="center" c="dimmed" className="py-8">
                  No duplicate uploads found
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            data.groups.map((group) => (
              <DuplicateGroupRow
                key={`${group.channelId}::${group.title ?? ''}::${group.publishedAt?.toString() ?? ''}`}
                group={group}
                matchPublishedAt={matchPublishedAt}
                onDelete={handleDelete}
                isDeleting={deleteMutation.isPending}
              />
            ))
          )}
        </Table.Tbody>
      </Table>
    </div>
  );
}
