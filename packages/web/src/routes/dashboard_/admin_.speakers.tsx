import {
  Badge,
  Button,
  Group,
  Pagination,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowsJoin } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';
import {
  type MergeSource,
  MergeSpeakerModal,
} from './-components/merge-speaker-modal';

export const Route = createFileRoute('/dashboard_/admin_/speakers')({
  component: AdminSpeakersPage,
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
      trpc.dashboard.admin.getAllSpeakers.queryOptions({ page: 1 }),
    );
    return { backNavigation: { label: 'Admin', to: '/dashboard/admin' } };
  },
});

function AdminSpeakersPage() {
  const trpc = useTRPC();
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    ...trpc.dashboard.admin.getAllSpeakers.queryOptions({ page }),
    placeholderData: keepPreviousData,
  });
  const speakers = data?.speakers ?? [];
  const pageCount = data?.pageCount ?? 1;

  const [mergeSource, setMergeSource] = useState<MergeSource | null>(null);
  const [mergeOpened, { open: openMerge, close: closeMerge }] = useDisclosure();

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>Speakers</Title>
        <Text c="dimmed" size="sm">
          Every named speaker across all channels. Manage a speaker from its
          channel's speakers page.
        </Text>
      </div>

      {speakers.length === 0 ? (
        <Text c="dimmed">No speakers have been created yet.</Text>
      ) : (
        <Table verticalSpacing="sm" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Speaker</Table.Th>
              <Table.Th>Channel</Table.Th>
              <Table.Th>Attributions</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {speakers.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {s.name}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Link
                    to="/dashboard/channels/$channelId/speakers"
                    params={{ channelId: s.channelId }}
                    style={{ textDecoration: 'none' }}
                  >
                    <Text size="sm" c="blue" span>
                      {s.channelName}
                    </Text>
                  </Link>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color="violet">
                    {s.attributionCount}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {formatDate(s.createdAt)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <Button
                      size="compact-sm"
                      variant="subtle"
                      color="gray"
                      leftSection={<IconArrowsJoin size={14} />}
                      onClick={() => {
                        setMergeSource({
                          id: s.id,
                          name: s.name,
                          channelName: s.channelName,
                        });
                        openMerge();
                      }}
                    >
                      Merge
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {pageCount > 1 ? (
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {data?.total ?? 0} speakers
          </Text>
          <Pagination
            total={pageCount}
            value={page}
            onChange={setPage}
            size="sm"
          />
        </Group>
      ) : null}

      <MergeSpeakerModal
        source={mergeSource}
        opened={mergeOpened}
        onClose={closeMerge}
      />
    </Stack>
  );
}
