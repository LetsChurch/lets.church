import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconEdit, IconPlus } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useAppMantineForm } from '@/components/mantine';
import { trpcClient, useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/dashboard_/admin_/users')({
  component: UsersPage,
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
      trpc.dashboard.admin.getUsers.queryOptions(),
    );
    return {
      backNavigation: {
        label: 'Admin',
        to: '/dashboard/admin',
      },
    };
  },
});

type UserFormData = {
  username: string;
  password?: string;
  fullName: string;
  email: string;
  role: 'USER' | 'ADMIN';
};

type User = {
  id: string;
  username: string;
  fullName: string | null;
  role: string;
  createdAt: Date;
  emails: { email: string; verifiedAt: Date | null }[];
};

function UsersPage() {
  const trpc = useTRPC();
  const [opened, { open, close }] = useDisclosure(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { data: users, refetch } = useSuspenseQuery(
    trpc.dashboard.admin.getUsers.queryOptions(),
  );

  const form = useAppMantineForm({
    defaultValues: {
      username: '',
      fullName: '',
      email: '',
      role: 'USER' as 'USER' | 'ADMIN',
      password: '',
    } as UserFormData,
    onSubmit: async ({ value }) => {
      try {
        if (editingUser) {
          await trpcClient.dashboard.admin.updateUser.mutate({
            userId: editingUser.id,
            username: value.username,
            fullName: value.fullName,
            email: value.email,
            role: value.role,
          });
          setEditingUser(null);
        } else {
          if (!value.password) {
            console.error('Password is required for creating users');
            return;
          }
          await trpcClient.dashboard.admin.createUser.mutate({
            username: value.username,
            password: value.password,
            fullName: value.fullName,
            email: value.email,
            role: value.role,
          });
        }
        close();
        form.reset();
        refetch();
      } catch (error) {
        console.error('Failed to save user:', error);
      }
    },
  });

  const handleEdit = (user: User) => {
    setEditingUser(user);
    form.setFieldValue('username', user.username);
    form.setFieldValue('fullName', user.fullName || '');
    form.setFieldValue('email', user.emails[0]?.email || '');
    form.setFieldValue('role', user.role as 'USER' | 'ADMIN');
    form.setFieldValue('password', '');
    open();
  };

  const handleCreate = () => {
    setEditingUser(null);
    form.reset();
    open();
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'red';
      case 'MODERATOR':
        return 'orange';
      default:
        return 'gray';
    }
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={1}>Users</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={handleCreate}>
          Add User
        </Button>
      </Group>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Created</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.map((user) => (
            <Table.Tr key={user.id}>
              <Table.Td>
                <Text fw={500}>{user.fullName || 'No name'}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {user.emails[0]?.email || 'No email'}
                </Text>
              </Table.Td>
              <Table.Td>
                <Badge color={getRoleBadgeColor(user.role)} size="sm">
                  {user.role}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {new Date(user.createdAt).toLocaleDateString()}
                </Text>
              </Table.Td>
              <Table.Td>
                <ActionIcon
                  variant="light"
                  onClick={() => handleEdit(user)}
                  size="sm"
                >
                  <IconEdit size={14} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal
        opened={opened}
        onClose={close}
        title={editingUser ? 'Edit User' : 'Create New User'}
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          method="post"
        >
          <Stack gap="md">
            <form.AppField name="username">
              {(field) => (
                <field.TextInputField
                  label="Username (required)"
                  placeholder="Enter username"
                  required
                />
              )}
            </form.AppField>

            {!editingUser && (
              <form.AppField name="password">
                {(field) => (
                  <field.PasswordInputField
                    label="Password (required)"
                    placeholder="Enter password"
                    required
                  />
                )}
              </form.AppField>
            )}

            <form.AppField name="fullName">
              {(field) => (
                <field.TextInputField
                  label="Full Name"
                  placeholder="Enter full name"
                />
              )}
            </form.AppField>

            <form.AppField name="email">
              {(field) => (
                <field.TextInputField
                  label="Email (required)"
                  placeholder="Enter email"
                  type="email"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="role">
              {(field) => (
                <field.SelectField
                  label="Role"
                  data={[
                    { value: 'USER', label: 'User' },
                    { value: 'ADMIN', label: 'Admin' },
                  ]}
                  required
                />
              )}
            </form.AppField>

            <Group justify="flex-end" mt="md">
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">{editingUser ? 'Update' : 'Create'}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
