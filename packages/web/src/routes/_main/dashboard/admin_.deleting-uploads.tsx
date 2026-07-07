import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';

import { Badge, Table, Text, Title } from '@/components/ui';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';

export const Route = createFileRoute(
  '/_main/dashboard/admin_/deleting-uploads',
)({
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
      trpc.dashboard.admin.getDeletingUploads.queryOptions({
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

  const { data } = useSuspenseQuery({
    ...trpc.dashboard.admin.getDeletingUploads.queryOptions({
      limit: 50,
      offset: 0,
    }),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Title order={1}>Deleting Uploads</Title>
          <Text c="dimmed">
            {data.totalCount} upload{data.totalCount !== 1 ? 's' : ''} currently
            being deleted
          </Text>
        </div>
      </div>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Upload</Table.Th>
            <Table.Th>Channel</Table.Th>
            <Table.Th>Uploaded By</Table.Th>
            <Table.Th>Deleted At</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.uploads.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text ta="center" c="dimmed" className="py-8">
                  No uploads currently being deleted
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            data.uploads.map((upload) => (
              <Table.Tr
                key={upload.id}
                style={{ cursor: 'pointer' }}
                onClick={() => {
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
                <Table.Td>
                  <Badge color="red" size="sm" className="mb-2.5">
                    Deleting
                  </Badge>
                  <Text size="sm">
                    {upload.deletedAt
                      ? formatDate(upload.deletedAt, 'short')
                      : 'N/A'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </div>
  );
}
