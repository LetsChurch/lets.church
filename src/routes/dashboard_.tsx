import {
  Anchor,
  AppShell,
  Box,
  Breadcrumbs,
  Burger,
  Group,
  NavLink,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
  useRouterState,
} from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import db from '@/util/db';
import { hasValidSession, requireAuthMiddleware } from './-functions';
import { MantineWrapper } from './-mantine';

const getChannelName = createServerFn({ method: 'GET' })
  .middleware([requireAuthMiddleware])
  .validator(z.object({ channelId: z.string() }))
  .handler(async ({ context, data }) => {
    invariant(context.session, 'Session not found');

    const channel = await db.channel.findFirst({
      select: { id: true, name: true, slug: true },
      where: {
        id: data.channelId,
        memberships: {
          some: { appUserId: context.session.appUser.id },
        },
      },
    });

    return channel;
  });

export const Route = createFileRoute('/dashboard_')({
  beforeLoad: async () => {
    if (!(await hasValidSession())) {
      return redirect({ to: '/auth/login' });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const [opened, { toggle }] = useDisclosure();
  const location = useLocation();
  const routerState = useRouterState();

  const channelId = (
    routerState.matches.find(
      (match) => match.params && 'channelId' in match.params,
    )?.params as { channelId?: string }
  )?.channelId;

  const channelNameQuery = useQuery({
    queryKey: ['channel-breadcrumb', channelId],
    queryFn: () => {
      invariant(channelId, 'channelId is required');
      return getChannelName({ data: { channelId } });
    },
    enabled: !!channelId,
  });

  const channel = channelNameQuery.data || null;

  const getBreadcrumbs = () => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const breadcrumbs = [
      <Anchor component={Link} to="/dashboard" key="dashboard" c="dimmed">
        Dashboard
      </Anchor>,
    ];

    if (pathParts.length > 1) {
      const section = pathParts[1];
      const sectionName = section.charAt(0).toUpperCase() + section.slice(1);
      breadcrumbs.push(
        <Anchor
          component={Link}
          to={`/dashboard/${section}`}
          key={section}
          c="dimmed"
        >
          {sectionName}
        </Anchor>,
      );

      if (section === 'channels' && channelId && channel) {
        breadcrumbs.push(
          <Anchor
            component={Link}
            to={`/dashboard/channels/${channelId}`}
            key={channelId}
            c="dimmed"
          >
            {channel.name}
          </Anchor>,
        );

        if (pathParts[3] === 'uploads') {
          breadcrumbs.push(<span key="uploads">Uploads</span>);
        }
      }
    }

    return breadcrumbs;
  };

  return (
    <MantineWrapper>
      <AppShell
        header={{ height: 60 }}
        navbar={{
          width: 300,
          breakpoint: 'sm',
          collapsed: { mobile: !opened },
        }}
        padding="md"
      >
        <AppShell.Header>
          <Group h="100%" px="md">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Anchor
              component={Link}
              to="/dashboard"
              size="lg"
              fw={500}
              td="none"
              c="inherit"
            >
              Dashboard
            </Anchor>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <Box style={{ flex: 1 }}>
            <NavLink
              label="Account"
              component={Link}
              to="/dashboard/account"
              active={location.pathname.startsWith('/dashboard/account')}
            />
            <NavLink
              label="Channels"
              component={Link}
              to="/dashboard/channels"
              active={location.pathname.startsWith('/dashboard/channels')}
            />
            <NavLink
              label="Churches"
              component={Link}
              to="/dashboard/churches"
              active={location.pathname.startsWith('/dashboard/churches')}
            />
          </Box>

          <Box
            mt="auto"
            pt="md"
            style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}
          >
            <Anchor component={Link} to="/" fw={500}>
              ← Back to Let's Church
            </Anchor>
          </Box>
        </AppShell.Navbar>

        <AppShell.Main>
          <Breadcrumbs mb="md">{getBreadcrumbs()}</Breadcrumbs>
          <Outlet />
        </AppShell.Main>
      </AppShell>
    </MantineWrapper>
  );
}
