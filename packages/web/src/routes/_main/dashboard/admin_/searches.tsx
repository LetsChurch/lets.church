import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { Fragment, useState } from 'react';

import { ActionIcon, Badge, Button, Table, Text, Title } from '@/components/ui';
import { notifications } from '@/components/ui/notifications';
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

export const Route = createFileRoute('/_main/dashboard/admin_/searches')({
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
          <span key={`dots-${i}`} className="text-secondary px-2 text-sm">
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

function SearchDetail({ params }: { params: SearchLogParams }) {
  const parsed = params.parsed ?? null;
  const answer = params.answer ?? null;
  const sources = params.sources ?? null;
  const chips = (label: string, values: string[] | undefined, color: string) =>
    values && values.length > 0 ? (
      <div className="flex flex-wrap items-center justify-start gap-[4px]">
        <Text size="xs" c="dimmed" fw={600}>
          {label}
        </Text>
        {values.map((v, i) => (
          <Badge key={`${v}-${i}`} size="sm" variant="light" color={color}>
            {v}
          </Badge>
        ))}
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-3 bg-gray-50 p-4 dark:bg-white/5">
      {parsed ? (
        <div className="flex flex-col gap-[6px]">
          <Text size="xs" fw={700} c="dimmed" className="uppercase">
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
        </div>
      ) : (
        <Text size="xs" c="dimmed">
          No structured parse recorded for this search.
        </Text>
      )}
      {answer ? (
        <div className="flex flex-col gap-[6px]">
          <Text size="xs" fw={700} c="dimmed" className="uppercase">
            AI answer
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {answer}
          </Text>
        </div>
      ) : null}
      {sources && sources.length > 0 ? (
        <div className="flex flex-col gap-[4px]">
          <Text size="xs" fw={700} c="dimmed" className="uppercase">
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
                className="no-underline"
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
        </div>
      ) : null}
    </div>
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <Title order={2}>Search Logs</Title>
          <Text size="sm" c="dimmed">
            View all search queries and their results statistics
          </Text>
        </div>
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
      </div>

      <div className="border-fancy-pants overflow-hidden rounded-lg bg-white dark:bg-zinc-900">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="w-10" />
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
                  <Text ta="center" c="dimmed" className="py-8">
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
                          className="text-inherit no-underline"
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
                        <div className="flex flex-wrap items-center justify-start gap-2.5">
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
                        </div>
                      </Table.Td>
                    </Table.Tr>
                    {isOpen && hasDetail ? (
                      <Table.Tr>
                        <Table.Td colSpan={5} className="p-0">
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
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Pagination total={totalPages} value={page} onChange={setPage} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Text size="sm" c="dimmed">
          Total searches: {data.totalCount.toLocaleString()}
        </Text>
        <Text size="sm" c="dimmed">
          Page {page} of {totalPages}
        </Text>
      </div>
    </div>
  );
}
