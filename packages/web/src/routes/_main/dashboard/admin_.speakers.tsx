import {
  IconArrowsJoin,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { ActionIcon, Badge, Button, Table, Text, Title } from '@/components/ui';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';
import {
  type MergeSource,
  MergeSpeakerModal,
} from './-components/merge-speaker-modal';

function paginationRange(
  current: number,
  total: number,
): Array<number | 'dots'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const range: Array<number | 'dots'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) range.push('dots');
  for (let p = start; p <= end; p += 1) range.push(p);
  if (end < total - 1) range.push('dots');
  range.push(total);
  return range;
}

function Pagination({
  total,
  value,
  onChange,
}: {
  total: number;
  value: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <ActionIcon
        variant="default"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label="Previous page"
      >
        <IconChevronLeft size={16} />
      </ActionIcon>
      {paginationRange(value, total).map((page, i) =>
        page === 'dots' ? (
          <span key={`dots-${i}`} className="px-2 text-secondary text-sm">
            …
          </span>
        ) : (
          <ActionIcon
            key={page}
            variant={page === value ? 'filled' : 'default'}
            color={page === value ? 'blue' : undefined}
            onClick={() => onChange(page)}
            aria-label={`Page ${page}`}
            aria-current={page === value ? 'page' : undefined}
          >
            <span className="text-sm tabular-nums">{page}</span>
          </ActionIcon>
        ),
      )}
      <ActionIcon
        variant="default"
        disabled={value >= total}
        onClick={() => onChange(value + 1)}
        aria-label="Next page"
      >
        <IconChevronRight size={16} />
      </ActionIcon>
    </div>
  );
}

export const Route = createFileRoute('/_main/dashboard/admin_/speakers')({
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
    <div className="flex flex-col gap-5">
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
        <Table highlightOnHover>
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
                    className="no-underline"
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
                  <div className="flex flex-wrap items-center justify-end gap-4">
                    <Button
                      size="xs"
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
                  </div>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {pageCount > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Text size="xs" c="dimmed">
            {data?.total ?? 0} speakers
          </Text>
          <Pagination total={pageCount} value={page} onChange={setPage} />
        </div>
      ) : null}

      <MergeSpeakerModal
        source={mergeSource}
        opened={mergeOpened}
        onClose={closeMerge}
      />
    </div>
  );
}
