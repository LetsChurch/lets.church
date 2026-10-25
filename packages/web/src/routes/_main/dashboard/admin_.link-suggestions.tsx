import type { LinkSuggestionSignal } from '@letschurch/temporal/util/org-channel-link-suggestions';
import { IconEyeOff, IconLink, IconStar } from '@tabler/icons-react';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import { MenuItemButton, OverflowMenu } from '@/components/lc-menu';
import { Anchor, Badge, Button, Table, Text, Title } from '@/components/ui';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useTRPC } from '@/trpc/react';

export const Route = createFileRoute(
  '/_main/dashboard/admin_/link-suggestions',
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
      trpc.dashboard.admin.linkSuggestions.list.queryOptions(),
    );
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
});

const SIGNAL_LABELS: Record<LinkSuggestionSignal['kind'], string> = {
  sharedMember: 'Shared member',
  slug: 'Same slug',
  website: 'Same website',
  mention: 'Name mentioned',
};

function RouteComponent() {
  const trpc = useTRPC();
  const { data, refetch } = useSuspenseQuery(
    trpc.dashboard.admin.linkSuggestions.list.queryOptions(),
  );

  const linkMutation = useMutation(
    trpc.dashboard.admin.linkSuggestions.link.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Channel linked to organization.' });
        await refetch();
      },
      onError: (error) => {
        showFailure({ message: error.message || 'Failed to link channel.' });
      },
    }),
  );

  const dismissMutation = useMutation(
    trpc.dashboard.admin.linkSuggestions.dismiss.mutationOptions({
      onSuccess: async () => {
        showSuccess({ message: 'Suggestion dismissed.' });
        await refetch();
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to dismiss suggestion.',
        });
      },
    }),
  );

  const isPending = linkMutation.isPending || dismissMutation.isPending;
  const strongCount = data.filter((s) => s.confidence === 'strong').length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Title order={1}>Link Suggestions</Title>
        <Text c="dimmed">
          {data.length} unlinked organization/channel pair
          {data.length !== 1 ? 's' : ''} that look related ({strongCount}{' '}
          strong). New ones are emailed weekly.
        </Text>
      </div>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Organization</Table.Th>
            <Table.Th>Channel</Table.Th>
            <Table.Th>Evidence</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text ta="center" c="dimmed" className="py-8">
                  No link suggestions
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            data.map((s) => {
              const pair = {
                organizationId: s.organization.id,
                channelId: s.channel.id,
              };
              return (
                <Table.Tr key={`${s.organization.id}:${s.channel.id}`}>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to="/churches/$slug"
                      params={{ slug: s.organization.slug }}
                      size="sm"
                      fw={500}
                    >
                      {s.organization.name}
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      {s.organization.slug}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to="/channel/$slug"
                      params={{ slug: s.channel.slug }}
                      size="sm"
                      fw={500}
                    >
                      {s.channel.name}
                    </Anchor>
                    <Text size="xs" c="dimmed">
                      @{s.channel.slug} · {s.channel.uploadCount} upload
                      {s.channel.uploadCount !== 1 ? 's' : ''}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge
                        size="sm"
                        color={s.confidence === 'strong' ? 'green' : 'yellow'}
                      >
                        {s.confidence}
                      </Badge>
                      {s.signals.map((signal) => (
                        <Badge
                          key={`${signal.kind}:${signal.detail ?? ''}`}
                          size="sm"
                          color="gray"
                        >
                          {SIGNAL_LABELS[signal.kind]}
                          {signal.detail ? `: ${signal.detail}` : ''}
                        </Badge>
                      ))}
                      {s.notifiedAt === null ? (
                        <Badge size="sm" color="blue">
                          new
                        </Badge>
                      ) : null}
                    </div>
                  </Table.Td>
                  <Table.Td>
                    <div className="flex items-center gap-1">
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconLink size={12} />}
                        disabled={isPending}
                        onClick={() =>
                          linkMutation.mutate({
                            ...pair,
                            officialChannel: false,
                          })
                        }
                      >
                        Link
                      </Button>
                      <OverflowMenu
                        label={`More actions for ${s.organization.name} and ${s.channel.name}`}
                        triggerProps={{ disabled: isPending }}
                      >
                        <MenuItemButton
                          icon={<IconStar size={16} />}
                          onClick={() =>
                            linkMutation.mutate({
                              ...pair,
                              officialChannel: true,
                            })
                          }
                        >
                          Link as official channel
                        </MenuItemButton>
                        <MenuItemButton
                          icon={<IconEyeOff size={16} />}
                          onClick={() => dismissMutation.mutate(pair)}
                        >
                          Dismiss
                        </MenuItemButton>
                      </OverflowMenu>
                    </div>
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
