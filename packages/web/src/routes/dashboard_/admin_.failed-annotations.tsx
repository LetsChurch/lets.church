import {
  ActionIcon,
  Badge,
  Box,
  Code,
  Group,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';
import { formatDate } from '@/util/format';
import { showFailure, showSuccess } from '../-mantine';

export const Route = createFileRoute('/dashboard_/admin_/failed-annotations')({
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
      trpc.dashboard.admin.getFailedAnnotations.queryOptions({
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
    ...trpc.dashboard.admin.getFailedAnnotations.queryOptions({
      limit: 50,
      offset: 0,
    }),
    refetchInterval: 10000,
  });

  const regenerateMutation = useMutation(
    trpc.dashboard.admin.regenerateUploadAnnotations.mutationOptions({
      onSuccess: async () => {
        showSuccess({
          message: 'Annotation regeneration started',
        });
        await refetch();
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to start annotation regeneration',
        });
      },
    }),
  );

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>Failed Annotations</Title>
        <Text c="dimmed">
          {data.uploads.length} upload{data.uploads.length === 1 ? '' : 's'}{' '}
          whose annotation pipeline failed (primary and fallback model) and have
          no OUTLINE annotations
        </Text>
      </div>

      <Table verticalSpacing="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Upload</Table.Th>
            <Table.Th>Channel</Table.Th>
            <Table.Th>Last attempt</Table.Th>
            <Table.Th>Outcome</Table.Th>
            <Table.Th>Model</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.uploads.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Text ta="center" c="dimmed" py="xl">
                  No failed annotations
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            data.uploads.map((upload) => (
              <Table.Tr
                key={upload.id}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  navigate({
                    to: `/dashboard/channels/${upload.channel.id}/uploads/${upload.id}`,
                  });
                }}
              >
                <Table.Td>
                  <Box style={{ maxWidth: 360 }}>
                    <Text fw={500} lineClamp={2} size="sm">
                      {upload.title || 'Untitled'}
                    </Text>
                    {upload.lastAttempt.errorMessage ? (
                      <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
                        {upload.lastAttempt.errorMessage}
                      </Text>
                    ) : null}
                  </Box>
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
                    {formatDate(upload.lastAttempt.at, 'short')}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color="red" size="sm">
                    {upload.lastAttempt.outcome}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Code>{upload.lastAttempt.model}</Code>
                </Table.Td>
                <Table.Td onClick={(e) => e.stopPropagation()}>
                  <Tooltip label="Regenerate annotations">
                    <ActionIcon
                      variant="light"
                      color="blue"
                      onClick={() =>
                        regenerateMutation.mutate({
                          uploadRecordId: upload.id,
                        })
                      }
                      loading={regenerateMutation.isPending}
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

      <Group justify="flex-end">
        <Text size="xs" c="dimmed">
          The fallback model is set by{' '}
          <Code>OPENROUTER_ANNOTATE_FALLBACK_MODEL</Code>. Both attempts are
          recorded in <Code>llm_call</Code>.
        </Text>
      </Group>
    </Stack>
  );
}
