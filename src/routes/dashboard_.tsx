import { Anchor, AppShell, Box, Burger, Group, NavLink } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';
import { BackButton } from '@/util/back-navigation';
import { MantineWrapper } from './-mantine';
import { DashboardSearchBar } from './dashboard_/-components/search-bar';

export const Route = createFileRoute('/dashboard_')({
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      return redirect({ to: '/auth/login' });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const [opened, { toggle }] = useDisclosure();
  const location = useLocation();
  const trpc = useTRPC();
  const { data: currentUser } = useQuery(
    trpc.common.getCurrentUser.queryOptions(),
  );

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
          <Group h="100%" px="md" justify="space-between">
            <Group>
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
                <Group gap="xs">
                  <img
                    src="/logoicon.svg"
                    alt="Let's Church Icon"
                    style={{
                      height: '1.5em',
                      width: 'auto',
                      position: 'relative',
                      top: '-0.125em',
                    }}
                  />
                  <span>Dashboard</span>
                </Group>
              </Anchor>
            </Group>

            <Box
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                maxWidth: 400,
              }}
            >
              <DashboardSearchBar currentUser={currentUser} />
            </Box>

            <Box style={{ width: 'auto' }} />
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
            <NavLink
              label="Organizations"
              component={Link}
              to="/dashboard/organizations"
              active={location.pathname.startsWith('/dashboard/organizations')}
            />
            {currentUser?.role === 'ADMIN' && (
              <NavLink
                label="Admin"
                component={Link}
                to="/dashboard/admin"
                active={location.pathname.startsWith('/dashboard/admin')}
              />
            )}
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
          <Box mb="md">
            <BackButton />
          </Box>
          <Outlet />
        </AppShell.Main>
      </AppShell>
    </MantineWrapper>
  );
}
