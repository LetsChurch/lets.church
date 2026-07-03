import {
  IconDots,
  IconEdit,
  IconKey,
  IconMail,
  IconPlus,
} from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { LcMenu, MenuItemButton } from '@/components/lc-menu';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import { ActionIcon, Badge, Button, Table, Text, Title } from '@/components/ui';
import { modals } from '@/components/ui/confirm-modal';
import { useAppForm } from '@/components/ui/form';
import { useDisclosure } from '@/hooks/use-disclosure';
import { trpcClient, useTRPC } from '@/trpc/react';

export const Route = createFileRoute('/_main/dashboard/admin_/users')({
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

  const form = useAppForm({
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
            appUserId: editingUser.id,
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

  const handleResetPassword = (userId: string) => {
    modals.openConfirmModal({
      title: 'Reset Password',
      children: (
        <Text size="sm">
          Are you sure you want to reset this user's password? A password reset
          email will be sent to the user.
        </Text>
      ),
      labels: { confirm: 'Reset Password', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await trpcClient.dashboard.admin.resetUserPassword.mutate({ userId });
          modals.open({
            title: 'Success',
            children: (
              <Text size="sm">Password reset email sent successfully!</Text>
            ),
          });
        } catch (error) {
          console.error('Failed to reset password:', error);
          modals.open({
            title: 'Error',
            children: (
              <Text size="sm" c="red">
                Failed to reset password. Please try again.
              </Text>
            ),
          });
        }
      },
    });
  };

  const handleResendVerificationEmail = (userId: string) => {
    modals.openConfirmModal({
      title: 'Resend Verification Email',
      children: (
        <Text size="sm">
          Are you sure you want to resend the verification email to this user?
        </Text>
      ),
      labels: { confirm: 'Resend Email', cancel: 'Cancel' },
      confirmProps: { color: 'blue' },
      onConfirm: async () => {
        try {
          await trpcClient.dashboard.admin.resendVerificationEmail.mutate({
            userId,
          });
          modals.open({
            title: 'Success',
            children: (
              <Text size="sm">Verification email sent successfully!</Text>
            ),
          });
        } catch (error) {
          console.error('Failed to resend verification email:', error);
          modals.open({
            title: 'Error',
            children: (
              <Text size="sm" c="red">
                Failed to resend verification email. Please try again.
              </Text>
            ),
          });
        }
      },
    });
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Title order={1}>Users</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={handleCreate}>
          Add User
        </Button>
      </div>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Username</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Created</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.map((user) => {
            const verifiedEmail = user.emails.find((e) => e.verifiedAt);
            const hasUnverified = user.emails.some((e) => !e.verifiedAt);
            const displayEmail = verifiedEmail ?? user.emails[0];

            return (
              <Table.Tr key={user.id}>
                <Table.Td>
                  <Text fw={500}>{user.username}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{user.fullName || 'No name'}</Text>
                </Table.Td>
                <Table.Td>
                  <div className="flex flex-wrap items-center justify-start gap-2.5">
                    <Text size="sm" c="dimmed">
                      {displayEmail?.email || 'No email'}
                    </Text>
                    {hasUnverified ? (
                      <Badge size="xs" color="yellow">
                        Unverified
                      </Badge>
                    ) : null}
                  </div>
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
                  <LcMenu.Root>
                    <LcMenu.Trigger
                      render={
                        <ActionIcon variant="light" size="sm">
                          <IconDots size={14} />
                        </ActionIcon>
                      }
                    />
                    <LcMenu.Portal>
                      <LcMenu.Positioner align="end" sideOffset={4}>
                        <LcMenu.Popup>
                          <MenuItemButton
                            icon={<IconEdit size={14} />}
                            onClick={() => handleEdit(user)}
                          >
                            Edit User
                          </MenuItemButton>
                          <MenuItemButton
                            icon={<IconKey size={14} />}
                            onClick={() => handleResetPassword(user.id)}
                          >
                            Reset Password
                          </MenuItemButton>
                          {hasUnverified ? (
                            <MenuItemButton
                              icon={<IconMail size={14} />}
                              onClick={() =>
                                handleResendVerificationEmail(user.id)
                              }
                            >
                              Resend Verification Email
                            </MenuItemButton>
                          ) : null}
                        </LcMenu.Popup>
                      </LcMenu.Positioner>
                    </LcMenu.Portal>
                  </LcMenu.Root>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      <LcModal.Root
        open={opened}
        onOpenChange={(o) => {
          if (!o) close();
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader
              title={editingUser ? 'Edit User' : 'Create New User'}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
              method="post"
            >
              <div className="flex flex-col gap-4">
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

                <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
                  <Button variant="outline" onClick={close}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingUser ? 'Update' : 'Create'}
                  </Button>
                </div>
              </div>
            </form>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </div>
  );
}
