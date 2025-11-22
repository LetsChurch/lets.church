import {
  Anchor,
  AppShell,
  Box,
  Burger,
  Group,
  NavLink,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconHelp } from '@tabler/icons-react';
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
import { HelpModal } from './dashboard_/-components/help-modal';
import { DashboardSearchBar } from './dashboard_/-components/search-bar';
import styles from './dashboard_/-styles.module.css';

export const Route = createFileRoute('/dashboard_')({
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const [opened, { toggle }] = useDisclosure();
  const [helpOpened, { open: openHelp, close: closeHelp }] = useDisclosure();
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
                  <svg
                    viewBox="0 0 650 650"
                    className={styles.dashboardLogo}
                    aria-label="Let's Church Icon"
                  >
                    <title>Let's Church Icon</title>
                    <use href="/logoicon.svg#logoicon" />
                  </svg>
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
            <UnstyledButton
              onClick={openHelp}
              mb="xs"
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
                borderRadius: 'var(--mantine-radius-sm)',
                fontSize: 'var(--mantine-font-size-sm)',
                fontWeight: 500,
                textDecoration: 'none',
                color: 'var(--mantine-color-text)',
                transition: 'background-color 100ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  'var(--mantine-color-gray-0)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Box
                component="span"
                mr="sm"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconHelp size={16} />
              </Box>
              <span>Help</span>
            </UnstyledButton>
            <Anchor
              component={Link}
              to="/"
              fw={500}
              className={styles.backLink}
            >
              ← Back to Let's Church
            </Anchor>
          </Box>
        </AppShell.Navbar>

        <HelpModal opened={helpOpened} onClose={closeHelp} />

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
