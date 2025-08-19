import { Anchor, AppShell, Box, Burger, Group, NavLink } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router';
import { BackButton, BackNavigationProvider } from '@/util/back-navigation';
import { hasValidSession } from './-functions';
import { MantineWrapper } from './-mantine';

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

  return (
    <MantineWrapper>
      <BackNavigationProvider>
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
            <Box mb="md">
              <BackButton />
            </Box>
            <Outlet />
          </AppShell.Main>
        </AppShell>
      </BackNavigationProvider>
    </MantineWrapper>
  );
}
