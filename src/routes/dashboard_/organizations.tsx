import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconDots,
  IconEye,
  IconSettings,
  IconUserMinus,
} from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useTRPC } from '@/trpc/react';
import classes from './-churches.module.css';

export const Route = createFileRoute('/dashboard_/organizations')({
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
      <Group justify="space-between" align="center" mb="lg">
        <Title order={1}>Organizations</Title>
        <Button onClick={openModal}>Add Organization</Button>
      </Group>

      <Stack gap="lg">
        <div>
          <Text fw={500} mb="xs">
            Organization Management
          </Text>
          <Text size="sm" c="dimmed" mb="lg">
            Manage your ministry organization profiles and information. Update
            details, manage users, and maintain your organizational presence.
          </Text>
        </div>

        <Text fw={500} size="lg">
          My Organizations
        </Text>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {organizations.map((organization) => {
            const membership = organization.memberships[0];
            const isAdmin = membership?.isAdmin ?? false;

            return (
              <Card
                key={organization.id}
                shadow="xs"
                padding="lg"
                radius="md"
                withBorder
                className={classes.card}
              >
                <Group justify="space-between" mb="xs">
                  <Link
                    to="/dashboard/organizations/$orgId"
                    params={{ orgId: organization.id }}
                    className={classes.titleLink}
                  >
                    <Text fw={500} truncate>
                      {organization.name}
                    </Text>
                  </Link>
                  <Group gap="xs">
                    <Badge color={isAdmin ? 'blue' : 'green'} size="sm">
                      {isAdmin ? 'Admin' : 'User'}
                    </Badge>
                    <Menu shadow="md" width={200}>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={(e) => e.preventDefault()}
                        >
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconEye size={14} />}>
                          View Details
                        </Menu.Item>
                        {isAdmin && (
                          <Menu.Item leftSection={<IconSettings size={14} />}>
                            Manage
                          </Menu.Item>
                        )}
                        <Menu.Item
                          leftSection={<IconUserMinus size={14} />}
                          color="red"
                        >
                          Leave Organization
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Group>
                <Text size="sm" c="dimmed">
                  {organization.description ||
                    (isAdmin
                      ? 'You have administrative access to this organization.'
                      : 'You have user access to this organization profile.')}
                </Text>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title="Add Organization"
        size="sm"
        centered
      >
        <Stack gap="md">
          <Text>
            Interested in partnering with Let's Church? We'd love to hear from
            you! Please reach out to us at{' '}
            <Anchor href="mailto:contact@lets.church?subject=Partnership%20Inquiry">
              contact@lets.church
            </Anchor>{' '}
            to discuss how we can work together.
          </Text>
          <Group justify="flex-end">
            <Button onClick={closeModal}>Okay</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
