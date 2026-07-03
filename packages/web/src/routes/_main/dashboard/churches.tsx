import {
  IconDots,
  IconEye,
  IconSettings,
  IconUserMinus,
} from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import {
  LcMenu,
  MenuItemButton,
  MenuItemRouterLink,
} from '@/components/lc-menu';
import {
  ActionIcon,
  Badge,
  Button,
  Text,
  Title,
  Tooltip,
} from '@/components/ui';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import classes from './-churches.module.css';
import styles from './-styles.module.css';

export const Route = createFileRoute('/_main/dashboard/churches')({
  component: ChurchesPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc } }) => {
    const data = await queryClient.ensureQueryData(
      trpc.dashboard.churches.getChurches.queryOptions(),
    );
    return {
      data,
      backNavigation: {
        label: 'Dashboard',
        to: '/dashboard',
      },
    };
  },
});

function ChurchesPage() {
  const trpc = useTRPC();
  const { data: churches } = useSuspenseQuery(
    trpc.dashboard.churches.getChurches.queryOptions(),
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <Title order={1}>Churches</Title>
        <Button
          component={Link}
          to="/dashboard/churches/new"
          className={styles.buttonLink}
        >
          Add Church
        </Button>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <Text fw={500} className="mb-2.5">
            Church Management
          </Text>
          <Text size="sm" c="dimmed" className="mb-5">
            Manage your church profiles and organizational information. Update
            details, manage users, and maintain your church presence.
          </Text>
        </div>

        <Text fw={500} size="lg">
          My Churches
        </Text>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {churches.map((church) => {
            const membership = church.memberships[0];
            const isAdmin = membership?.isAdmin ?? false;

            return (
              <div
                key={church.id}
                className={cn(
                  classes.card,
                  'overflow-hidden rounded-lg border-fancy-pants bg-white p-5 shadow-sm dark:bg-zinc-900',
                )}
              >
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
                  <Link
                    to="/dashboard/churches/$churchId"
                    params={{ churchId: church.id }}
                    className={classes.titleLink}
                  >
                    <Text fw={500} truncate>
                      {church.name}
                    </Text>
                  </Link>
                  <div className="flex flex-wrap items-center justify-start gap-2.5">
                    <Tooltip
                      label={
                        isAdmin
                          ? 'You can edit this church profile and manage settings'
                          : 'You have access to view this church profile'
                      }
                      withArrow
                    >
                      <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                        {isAdmin ? 'Admin' : 'User'}
                      </Badge>
                    </Tooltip>
                    <LcMenu.Root>
                      <LcMenu.Trigger
                        render={(props) => (
                          <ActionIcon
                            {...props}
                            variant="subtle"
                            color="gray"
                            onClick={(e) => e.preventDefault()}
                          >
                            <IconDots size={16} />
                          </ActionIcon>
                        )}
                      />
                      <LcMenu.Portal>
                        <LcMenu.Positioner align="end" sideOffset={4}>
                          <LcMenu.Popup>
                            <MenuItemRouterLink
                              to="/dashboard/churches/$churchId"
                              params={{ churchId: church.id }}
                              icon={<IconEye size={14} />}
                            >
                              View Details
                            </MenuItemRouterLink>
                            {isAdmin && (
                              <MenuItemRouterLink
                                to="/dashboard/churches/$churchId/edit"
                                params={{ churchId: church.id }}
                                icon={<IconSettings size={14} />}
                              >
                                Manage
                              </MenuItemRouterLink>
                            )}
                            <MenuItemButton
                              icon={<IconUserMinus size={14} />}
                              className="text-red-600 dark:text-red-400"
                            >
                              Leave Church
                            </MenuItemButton>
                          </LcMenu.Popup>
                        </LcMenu.Positioner>
                      </LcMenu.Portal>
                    </LcMenu.Root>
                  </div>
                </div>
                <Text size="sm" c="dimmed">
                  {church.description ||
                    (isAdmin
                      ? 'You have administrative access to this church.'
                      : 'You have user access to this church profile.')}
                </Text>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
