import {
  Badge,
  Card,
  Group,
  Pagination,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/admin_/searches')({
  component: SearchLogsPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.admin.getSearchLogs.queryOptions({
        limit: 50,
        offset: 0,
      }),
    );

    return {
      backNavigation: {
        label: 'Admin Dashboard',
        to: '/dashboard/admin',
      },
    };
  },
});

const ITEMS_PER_PAGE = 50;

function SearchLogsPage() {
  const trpc = useTRPC();
  const [page, setPage] = useState(1);

  const { data } = useSuspenseQuery(
    trpc.dashboard.admin.getSearchLogs.queryOptions({
      limit: ITEMS_PER_PAGE,
      offset: (page - 1) * ITEMS_PER_PAGE,
    }),
  );

  const totalPages = Math.ceil(data.totalCount / ITEMS_PER_PAGE);

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={2}>Search Logs</Title>
        <Text size="sm" c="dimmed">
          View all search queries and their results statistics
        </Text>
      </Stack>

      <Card padding="0" radius="md" withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Query</Table.Th>
              <Table.Th>User</Table.Th>
              <Table.Th>Time</Table.Th>
              <Table.Th>Results</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.searchLogs.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text ta="center" c="dimmed" py="xl">
                    No search logs found
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              data.searchLogs.map((log) => {
                // Reconstruct the search URL with params
                const params = log.params as {
                  focus?: string;
                  channelIds?: string[];
                  sort?: string;
                  dateRange?: string;
                };

                return (
                  <Table.Tr key={log.id}>
                    <Table.Td>
                      <Link
                        to="/search"
                        search={{
                          q: log.query,
                          focus:
                            (params.focus as 'media' | 'transcripts') ??
                            'media',
                          skipLogging: true,
                        }}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <Text
                          fw={500}
                          size="sm"
                          style={{ cursor: 'pointer' }}
                          c="blue"
                        >
                          {log.query}
                        </Text>
                      </Link>
                    </Table.Td>
                    <Table.Td>
                      {log.appUser ? (
                        <Text size="sm">
                          {log.appUser.fullName || log.appUser.username}
                        </Text>
                      ) : (
                        <Text size="sm" c="dimmed">
                          Anonymous
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatDistanceToNow(new Date(log.createdAt), {
                          addSuffix: true,
                        })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        {log.mediaCount > 0 ? (
                          <Badge size="sm" variant="light" color="blue">
                            {log.mediaCount} media
                          </Badge>
                        ) : null}
                        {log.transcriptCount > 0 ? (
                          <Badge size="sm" variant="light" color="green">
                            {log.transcriptCount} transcripts
                          </Badge>
                        ) : null}
                        {log.channelCount > 0 ? (
                          <Badge size="sm" variant="light" color="violet">
                            {log.channelCount} channels
                          </Badge>
                        ) : null}
                        {log.mediaCount === 0 &&
                        log.transcriptCount === 0 &&
                        log.channelCount === 0 ? (
                          <Text size="sm" c="dimmed">
                            No results
                          </Text>
                        ) : null}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {totalPages > 1 ? (
        <Group justify="center">
          <Pagination
            total={totalPages}
            value={page}
            onChange={setPage}
            size="sm"
          />
        </Group>
      ) : null}

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Total searches: {data.totalCount.toLocaleString()}
        </Text>
        <Text size="sm" c="dimmed">
          Page {page} of {totalPages}
        </Text>
      </Group>
    </Stack>
  );
}
