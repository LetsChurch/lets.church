import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Pagination,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconChevronDown,
  IconChevronRight,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { Fragment, useState } from 'react';
import { useTRPC } from '@/trpc/react';

// The search_log_entry `params` jsonb. hybridSearch creates the row; searchMeta
// merges the structured LLM parse under `parsed`, and the answer route appends
// the final answer under `answer` (see routes/api/search-answer.ts).
type ParsedQuery = {
  questions?: string[];
  keywords?: string[];
  speakers?: string[];
  channels?: string[];
  quotes?: string[];
  objects?: string[];
  dates?: { gte: string | null; lte: string | null } | null;
};
type LogSource = {
  id: string;
  title: string | null;
  channelName: string | null;
  startSeconds: number;
};
type SearchLogParams = {
  parsed?: ParsedQuery | null;
  answer?: string | null;
  sources?: LogSource[] | null;
};

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

function SearchDetail({ params }: { params: SearchLogParams }) {
  const parsed = params.parsed ?? null;
  const answer = params.answer ?? null;
  const sources = params.sources ?? null;
  const chips = (label: string, values: string[] | undefined, color: string) =>
    values && values.length > 0 ? (
      <Group gap={4} wrap="wrap">
        <Text size="xs" c="dimmed" fw={600}>
          {label}
        </Text>
        {values.map((v, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list; index disambiguates duplicate values
          <Badge key={`${v}-${i}`} size="sm" variant="light" color={color}>
            {v}
          </Badge>
        ))}
      </Group>
    ) : null;

  return (
    <Stack gap="sm" p="md" bg="var(--mantine-color-default-hover)">
      {parsed ? (
        <Stack gap={6}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
            Parsed query
          </Text>
          {chips('Questions', parsed.questions, 'grape')}
          {chips('Keywords', parsed.keywords, 'blue')}
          {chips('Speakers', parsed.speakers, 'orange')}
          {chips('Channels', parsed.channels, 'violet')}
          {chips('Quotes', parsed.quotes, 'teal')}
          {chips('Objects', parsed.objects, 'pink')}
          {parsed.dates && (parsed.dates.gte || parsed.dates.lte) ? (
            <Text size="xs" c="dimmed">
              Dates: {parsed.dates.gte ?? '…'} → {parsed.dates.lte ?? '…'}
            </Text>
          ) : null}
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          No structured parse recorded for this search.
        </Text>
      )}
      {answer ? (
        <Stack gap={6}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
            AI answer
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {answer}
          </Text>
        </Stack>
      ) : null}
      {sources && sources.length > 0 ? (
        <Stack gap={4}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
            Sources
          </Text>
          {sources.map((s, i) => (
            <Text key={s.id} size="xs">
              <Text span c="dimmed">
                [{i + 1}]
              </Text>{' '}
              <Link
                to="/media/$mediaId"
                params={{ mediaId: s.id }}
                hash={`t=${s.startSeconds}`}
                style={{ textDecoration: 'none' }}
              >
                <Text span c="blue">
                  {s.title ?? 'Untitled'}
                </Text>
              </Link>
              {s.channelName ? (
                <Text span c="dimmed">
                  {' '}
                  — {s.channelName}
                </Text>
              ) : null}
            </Text>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

function SearchLogsPage() {
  const trpc = useTRPC();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const { data } = useSuspenseQuery(
    trpc.dashboard.admin.getSearchLogs.queryOptions({
      limit: ITEMS_PER_PAGE,
      offset: (page - 1) * ITEMS_PER_PAGE,
    }),
  );

  const clearCache = useMutation(
    trpc.dashboard.admin.clearSearchCache.mutationOptions({
      onSuccess: ({ total, parses, related, answers }) => {
        notifications.show({
          title: 'Search cache cleared',
          message: `Removed ${total} entries (${parses} parses, ${related} related, ${answers} answers).`,
          color: 'green',
        });
      },
      onError: (error) => {
        notifications.show({
          title: 'Failed to clear cache',
          message: error.message,
          color: 'red',
        });
      },
    }),
  );

  const totalPages = Math.ceil(data.totalCount / ITEMS_PER_PAGE);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <Stack gap="xs">
          <Title order={2}>Search Logs</Title>
          <Text size="sm" c="dimmed">
            View all search queries and their results statistics
          </Text>
        </Stack>
        <Button
          variant="light"
          color="red"
          leftSection={<IconTrash size={16} />}
          loading={clearCache.isPending}
          onClick={() => {
            if (
              window.confirm(
                'Clear all cached search query parses and AI answers? The next search will re-parse and regenerate.',
              )
            ) {
              clearCache.mutate();
            }
          }}
        >
          Clear cache
        </Button>
      </Group>

      <Card padding="0" radius="md" withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40} />
              <Table.Th>Query</Table.Th>
              <Table.Th>User</Table.Th>
              <Table.Th>Time</Table.Th>
              <Table.Th>Results</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.searchLogs.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text ta="center" c="dimmed" py="xl">
                    No search logs found
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              data.searchLogs.map((log) => {
                const params = (log.params ?? {}) as SearchLogParams;
                const hasDetail = Boolean(params.parsed || params.answer);
                const isOpen = expanded.has(log.id);
                return (
                  <Fragment key={log.id}>
                    <Table.Tr>
                      <Table.Td>
                        {hasDetail ? (
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            onClick={() => toggle(log.id)}
                            aria-label={isOpen ? 'Collapse' : 'Expand'}
                          >
                            {isOpen ? (
                              <IconChevronDown size={16} />
                            ) : (
                              <IconChevronRight size={16} />
                            )}
                          </ActionIcon>
                        ) : null}
                      </Table.Td>
                      <Table.Td>
                        <Link
                          to="/search"
                          search={{
                            q: log.query,
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
                          {params.answer ? (
                            <Badge size="sm" variant="light" color="grape">
                              answer
                            </Badge>
                          ) : null}
                          {log.mediaCount === 0 &&
                          log.transcriptCount === 0 &&
                          log.channelCount === 0 &&
                          !params.answer ? (
                            <Text size="sm" c="dimmed">
                              No results
                            </Text>
                          ) : null}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                    {isOpen && hasDetail ? (
                      <Table.Tr>
                        <Table.Td colSpan={5} p={0}>
                          <SearchDetail params={params} />
                        </Table.Td>
                      </Table.Tr>
                    ) : null}
                  </Fragment>
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
