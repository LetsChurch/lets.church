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
import { LcModal, ModalHeader } from '@/components/lc-modal';
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Text,
  Title,
} from '@/components/ui';
import { useDisclosure } from '@/hooks/use-disclosure';
import { useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import classes from './-churches.module.css';

export const Route = createFileRoute('/_main/dashboard/organizations')({
  component: OrganizationsPage,
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
      trpc.dashboard.organizations.getOrganizations.queryOptions(),
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

function OrganizationsPage() {
  const trpc = useTRPC();
  const { data: organizations } = useSuspenseQuery(
    trpc.dashboard.organizations.getOrganizations.queryOptions(),
  );
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure();

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <Title order={1}>Organizations</Title>
        <Button onClick={openModal}>Add Organization</Button>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <Text fw={500} className="mb-2.5">
            Organization Management
          </Text>
          <Text size="sm" c="dimmed" className="mb-5">
            Manage your ministry organization profiles and information. Update
            details, manage users, and maintain your organizational presence.
          </Text>
        </div>

        <Text fw={500} size="lg">
          My Organizations
        </Text>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {organizations.map((organization) => {
            const membership = organization.memberships[0];
            const isAdmin = membership?.isAdmin ?? false;

            return (
              <div
                key={organization.id}
                className={cn(
                  classes.card,
                  'overflow-hidden rounded-lg border-fancy-pants bg-white p-5 shadow-sm dark:bg-zinc-900',
                )}
              >
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4">
                  <Link
                    to="/dashboard/organizations/$orgId"
                    params={{ orgId: organization.id }}
                    className={classes.titleLink}
                  >
                    <Text fw={500} truncate>
                      {organization.name}
                    </Text>
                  </Link>
                  <div className="flex flex-wrap items-center justify-start gap-2.5">
                    <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                      {isAdmin ? 'Admin' : 'Member'}
                    </Badge>
                    <LcMenu.Root>
                      <LcMenu.Trigger
                        render={(props) => (
                          <ActionIcon
                            {...props}
                            variant="subtle"
                            color="gray"
                            onClick={(e) => {
                              e.preventDefault();
                              props.onClick?.(e);
                            }}
                          >
                            <IconDots size={16} />
                          </ActionIcon>
                        )}
                      />
                      <LcMenu.Portal>
                        <LcMenu.Positioner sideOffset={8} align="end">
                          <LcMenu.Popup>
                            <MenuItemRouterLink
                              to="/dashboard/organizations/$orgId"
                              params={{ orgId: organization.id }}
                              icon={<IconEye size={14} />}
                            >
                              View Details
                            </MenuItemRouterLink>
                            {isAdmin && (
                              <MenuItemRouterLink
                                to="/dashboard/organizations/$orgId/edit"
                                params={{ orgId: organization.id }}
                                icon={<IconSettings size={14} />}
                              >
                                Manage
                              </MenuItemRouterLink>
                            )}
                            <MenuItemButton
                              icon={<IconUserMinus size={14} />}
                              className="text-red-600 dark:text-red-400"
                            >
                              Leave Organization
                            </MenuItemButton>
                          </LcMenu.Popup>
                        </LcMenu.Positioner>
                      </LcMenu.Portal>
                    </LcMenu.Root>
                  </div>
                </div>
                <Text size="sm" c="dimmed">
                  {organization.description ||
                    (isAdmin
                      ? 'You have administrative access to this organization.'
                      : 'You are a member of this organization.')}
                </Text>
              </div>
            );
          })}
        </div>
      </div>

      <LcModal.Root
        open={modalOpened}
        onOpenChange={(o) => {
          if (!o) closeModal();
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="sm">
            <ModalHeader title="Add Organization" />
            <div className="flex flex-col gap-4">
              <Text>
                Interested in partnering with Let's Church? We'd love to hear
                from you! Please reach out to us at{' '}
                <Anchor href="mailto:contact@lets.church?subject=Partnership%20Inquiry">
                  contact@lets.church
                </Anchor>{' '}
                to discuss how we can work together.
              </Text>
              <div className="flex flex-wrap items-center justify-end gap-4">
                <Button onClick={closeModal}>Okay</Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </>
  );
}
