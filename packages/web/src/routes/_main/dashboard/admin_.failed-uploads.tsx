import { IconRefresh } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import {
  ActionIcon,
  Badge,
  Button,
  Table,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute('/_main/dashboard/admin_/failed-uploads')({
  component: RouteComponent,
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
      trpc.dashboard.admin.getFailedUploads.queryOptions({
        limit: 50,
        offset: 0,
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

function RouteComponent() {
  const trpc = useTRPC();
  const navigate = useNavigate();

  const { data, refetch } = useSuspenseQuery({
    ...trpc.dashboard.admin.getFailedUploads.queryOptions({
      limit: 50,
      offset: 0,
    }),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const retryMutation = useMutation(
    trpc.dashboard.admin.retryUploadProcessing.mutationOptions({
      onSuccess: async () => {
        showSuccess({
          message: 'Upload processing restarted successfully!',
        });
        await refetch();
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to retry upload processing',
        });
      },
    }),
  );

  const bulkRetryMutation = useMutation(
    trpc.dashboard.admin.bulkRetryProcessingUploads.mutationOptions({
      onSuccess: async ({ retriedCount, skippedCount }) => {
        showSuccess({
          message: `Bulk retry initiated: ${retriedCount} upload${retriedCount !== 1 ? 's' : ''} restarted${skippedCount > 0 ? `, ${skippedCount} skipped (already running)` : ''}`,
        });
        await refetch();
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to bulk retry processing uploads',
        });
      },
    }),
  );

  const handleRetry = (uploadRecordId: string) => {
    retryMutation.mutate({ uploadRecordId });
  };

  const getStatusBadge = (upload: (typeof data.uploads)[0]) => {
    const {
      transcodingStartedAt,
      transcodingFinishedAt,
      transcribingStartedAt,
      transcribingFinishedAt,
    } = upload;

    if (!transcodingStartedAt && !transcribingStartedAt) {
      return (
        <Badge color="red" size="sm">
          Not Started
        </Badge>
      );
    }

    if (transcodingStartedAt && !transcodingFinishedAt) {
      return (
        <Badge color="orange" size="sm">
          Transcoding Failed
        </Badge>
      );
    }

    if (transcribingStartedAt && !transcribingFinishedAt) {
      return (
        <Badge color="orange" size="sm">
          Transcribing Failed
        </Badge>
      );
    }

    return (
      <Badge color="gray" size="sm">
        Unknown
      </Badge>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Failed Uploads</Title>
          <Text c="dimmed">
            {data.uploads.length} failed uploads (out of {data.totalCount} total
            unprocessed)
          </Text>
        </div>
        {data.uploads.length > 0 ? (
          <Button
            variant="light"
            color="blue"
            leftSection={<IconRefresh size={16} />}
            onClick={() => {
              bulkRetryMutation.mutate();
            }}
            loading={bulkRetryMutation.isPending}
          >
            Retry All Without Active Workflow
          </Button>
        ) : null}
      </div>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Upload</Table.Th>
            <Table.Th>Channel</Table.Th>
            <Table.Th>Uploaded By</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Finalized</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.uploads.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Text ta="center" c="dimmed" className="py-8">
                  No failed uploads found
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            data.uploads.map((upload) => (
              <Table.Tr
                key={upload.id}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  // Don't navigate if clicking on the retry button
                  if ((e.target as HTMLElement).closest('button')) {
                    return;
                  }
                  navigate({
                    to: `/dashboard/channels/${upload.channel.id}/uploads/${upload.id}`,
                  });
                }}
              >
                <Table.Td>
                  <div style={{ maxWidth: 400 }}>
                    <Text fw={500} lineClamp={2} size="sm">
                      {upload.title || 'Untitled'}
                    </Text>
                    {upload.description ? (
                      <Text
                        size="xs"
                        c="dimmed"
                        lineClamp={2}
                        className="mt-[2px]"
                      >
                        {upload.description}
                      </Text>
                    ) : null}
                  </div>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {upload.channel.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    @{upload.channel.slug}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {upload.createdBy.fullName || upload.createdBy.username}
                  </Text>
                  <Text size="xs" c="dimmed">
                    @{upload.createdBy.username}
                  </Text>
                </Table.Td>
                <Table.Td>{getStatusBadge(upload)}</Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {upload.uploadFinalizedAt
                      ? formatDate(upload.uploadFinalizedAt, 'short')
                      : 'N/A'}
                  </Text>
                </Table.Td>
                <Table.Td onClick={(e) => e.stopPropagation()}>
                  <Tooltip label="Retry processing">
                    <ActionIcon
                      variant="light"
                      color="blue"
                      onClick={() => handleRetry(upload.id)}
                      loading={retryMutation.isPending}
                    >
                      <IconRefresh size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </div>
  );
}
