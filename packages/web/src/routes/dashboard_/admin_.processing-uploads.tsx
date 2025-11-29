import {
  Badge,
  Box,
  Group,
  Progress,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';
import { formatDate, formatTime } from '@/util/format';

export const Route = createFileRoute('/dashboard_/admin_/processing-uploads')({
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
    <Stack gap="lg">
      <div>
        <Title order={1}>Processing Uploads</Title>
        <Text c="dimmed">
          {uploads.length} total uploads • {transcodingCount} transcoding •{' '}
          {transcribingCount} transcribing
        </Text>
      </div>

      <Table verticalSpacing="md">
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
                <Text ta="center" c="dimmed" py="xl">
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
                    <Group gap="sm" align="flex-start">
                      <Box pos="relative">
                        <Box
                          w={120}
                          h={68}
                          bg="gray.3"
                          style={{
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Text size="xs" c="dimmed">
                            📹
                          </Text>
                        </Box>
                        {upload.lengthSeconds ? (
                          <Box
                            pos="absolute"
                            bottom={4}
                            right={4}
                            px={4}
                            py={1}
                            bg="rgba(0, 0, 0, 0.8)"
                            style={{
                              borderRadius: 2,
                              fontSize: '11px',
                              color: 'white',
                              fontFamily: 'monospace',
                              lineHeight: 1,
                            }}
                          >
                            {formatTime(upload.lengthSeconds * 1000)}
                          </Box>
                        ) : null}
                      </Box>
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text fw={500} lineClamp={2} size="sm">
                          {upload.title}
                        </Text>
                        <Text
                          size="xs"
                          c="dimmed"
                          lineClamp={2}
                          mt={2}
                          fs={upload.description ? 'normal' : 'italic'}
                        >
                          {upload.description || 'No description'}
                        </Text>
                      </Box>
                    </Group>
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
                    <Stack gap="md">
                      <Box>
                        <Text size="sm" fw={500} mb="xs">
                          {isTranscoding
                            ? 'Transcoding video...'
                            : 'Transcoding complete'}
                        </Text>
                        <Progress
                          value={
                            isTranscoding
                              ? upload.transcodingProgress * 100
                              : 100
                          }
                          size="lg"
                          animated={isTranscoding}
                          striped={isTranscoding}
                          color={isTranscoding ? undefined : 'green'}
                        />
                        <Text size="xs" c="dimmed" mt="xs">
                          {isTranscoding
                            ? `${Math.round(upload.transcodingProgress * 100)}% complete`
                            : 'Video transcoding finished'}
                        </Text>
                      </Box>
                      <Box>
                        <Text size="sm" fw={500} mb="xs">
                          {isTranscribing
                            ? 'Transcribing audio...'
                            : 'Transcription complete'}
                        </Text>
                        <Progress
                          value={100}
                          size="lg"
                          animated={isTranscribing}
                          striped={isTranscribing}
                          color={isTranscribing ? undefined : 'green'}
                        />
                        <Text size="xs" c="dimmed" mt="xs">
                          {isTranscribing
                            ? 'Processing audio transcript'
                            : 'Audio transcription finished'}
                        </Text>
                      </Box>
                    </Stack>
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
    </Stack>
  );
}
