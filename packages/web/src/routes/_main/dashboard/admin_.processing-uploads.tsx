import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';

import { Badge, Progress, Table, Text, Title } from '@/components/ui';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { formatDate, formatTime } from '@/util/format';

function ProgressBar({
  value,
  color,
  className,
}: {
  value: number;
  color?: 'green';
  className?: string;
}) {
  return (
    <Progress value={value} color={color} animated className={className} />
  );
}

export const Route = createFileRoute(
  '/_main/dashboard/admin_/processing-uploads',
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
      trpc.dashboard.admin.getProcessingUploads.queryOptions(),
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

  const { data: uploads } = useSuspenseQuery({
    ...trpc.dashboard.admin.getProcessingUploads.queryOptions(),
    refetchInterval: 2000,
  });

  const transcodingCount = uploads.filter(
    (upload) => !upload.transcodingFinishedAt,
  ).length;
  const transcribingCount = uploads.filter(
    (upload) => !upload.transcribingFinishedAt,
  ).length;

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'PUBLIC':
        return <IconEye size={16} />;
      case 'PRIVATE':
        return <IconEyeOff size={16} />;
      default:
        return <IconEye size={16} stroke={1} />;
    }
  };

  const getVisibilityColor = (visibility: string) => {
    switch (visibility) {
      case 'PUBLIC':
        return 'green';
      case 'PRIVATE':
        return 'red';
      case 'UNLISTED':
        return 'orange';
      default:
        return 'gray';
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Title order={1}>Processing Uploads</Title>
        <Text c="dimmed">
          {uploads.length} total uploads • {transcodingCount} transcoding •{' '}
          {transcribingCount} transcribing
        </Text>
      </div>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Video</Table.Th>
            <Table.Th>Channel</Table.Th>
            <Table.Th>Visibility</Table.Th>
            <Table.Th>Processing</Table.Th>
            <Table.Th>Created</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {uploads.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text ta="center" c="dimmed" className="py-8">
                  No uploads currently processing
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            uploads.map((upload) => {
              const isTranscoding = !upload.transcodingFinishedAt;
              const isTranscribing = !upload.transcribingFinishedAt;

              return (
                <Table.Tr key={upload.id}>
                  <Table.Td
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      navigate({
                        to: `/dashboard/channels/${upload.channel.id}/uploads/${upload.id}`,
                      });
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-start gap-3">
                      <div className="relative">
                        <div
                          className="flex shrink-0 items-center justify-center rounded bg-gray-200 dark:bg-zinc-800"
                          style={{ width: 120, height: 68 }}
                        >
                          <Text size="xs" c="dimmed">
                            📹
                          </Text>
                        </div>
                        {upload.lengthSeconds ? (
                          <div
                            className="absolute"
                            style={{
                              bottom: 4,
                              right: 4,
                              padding: '1px 4px',
                              borderRadius: 2,
                              fontSize: '11px',
                              color: 'white',
                              fontFamily: 'monospace',
                              lineHeight: 1,
                              background: 'rgba(0, 0, 0, 0.8)',
                            }}
                          >
                            {formatTime(upload.lengthSeconds * 1000)}
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Text fw={500} lineClamp={2} size="sm">
                          {upload.title}
                        </Text>
                        <Text
                          size="xs"
                          c="dimmed"
                          lineClamp={2}
                          className={cn(
                            upload.description ? undefined : 'italic',
                            'mt-[2px]',
                          )}
                        >
                          {upload.description || 'No description'}
                        </Text>
                      </div>
                    </div>
                  </Table.Td>
                  <Table.Td
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      navigate({
                        to: `/dashboard/channels/${upload.channel.id}/uploads/${upload.id}`,
                      });
                    }}
                  >
                    <Text size="sm" fw={500}>
                      {upload.channel.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      @{upload.channel.slug}
                    </Text>
                  </Table.Td>
                  <Table.Td
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      navigate({
                        to: `/dashboard/channels/${upload.channel.id}/uploads/${upload.id}`,
                      });
                    }}
                  >
                    <Badge
                      color={getVisibilityColor(upload.visibility)}
                      size="sm"
                      leftSection={getVisibilityIcon(upload.visibility)}
                    >
                      {upload.visibility}
                    </Badge>
                  </Table.Td>
                  <Table.Td
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      navigate({
                        to: `/dashboard/channels/${upload.channel.id}/uploads/${upload.id}`,
                      });
                    }}
                  >
                    <div className="flex flex-col gap-4">
                      <div>
                        <Text size="sm" fw={500} className="mb-2.5">
                          {isTranscoding
                            ? 'Transcoding video...'
                            : 'Transcoding complete'}
                        </Text>
                        <ProgressBar
                          value={
                            isTranscoding
                              ? upload.transcodingProgress * 100
                              : 100
                          }
                          className="h-2.5"
                          color={isTranscoding ? undefined : 'green'}
                        />
                        <Text size="xs" c="dimmed" className="mt-2.5">
                          {isTranscoding
                            ? `${Math.min(Math.round(upload.transcodingProgress * 100), 99)}% complete`
                            : 'Video transcoding finished'}
                        </Text>
                      </div>
                      <div>
                        <Text size="sm" fw={500} className="mb-2.5">
                          {isTranscribing
                            ? 'Transcribing audio...'
                            : 'Transcription complete'}
                        </Text>
                        <ProgressBar
                          value={100}
                          className="h-2.5"
                          color={isTranscribing ? undefined : 'green'}
                        />
                        <Text size="xs" c="dimmed" className="mt-2.5">
                          {isTranscribing
                            ? 'Processing audio transcript'
                            : 'Audio transcription finished'}
                        </Text>
                      </div>
                    </div>
                  </Table.Td>
                  <Table.Td
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      navigate({
                        to: `/dashboard/channels/${upload.channel.id}/uploads/${upload.id}`,
                      });
                    }}
                  >
                    <Text size="sm">
                      {formatDate(upload.createdAt, 'short')}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
    </div>
  );
}
