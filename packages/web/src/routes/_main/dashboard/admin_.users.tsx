import {
  IconBan,
  IconEdit,
  IconKey,
  IconLockOpen,
  IconMail,
  IconPlus,
} from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import { DashboardPageHeader } from '@/components/dashboard/dashboard-ui';
import { DataTable } from '@/components/dashboard/data-table';
import { MenuItemButton, OverflowMenu } from '@/components/lc-menu';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import { Badge, Button, Text, Textarea } from '@/components/ui';
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
  bannedAt: Date | null;
  banReason: string | null;
  emails: { email: string; verifiedAt: Date | null }[];
};

type UserTableMeta = {
  onBan: (user: User) => void;
  onEdit: (user: User) => void;
  onResendVerification: (userId: string) => void;
  onResetPassword: (userId: string) => void;
  onUnban: (user: User) => void;
};

function roleBadgeColor(role: string) {
  if (role === 'ADMIN') return 'red';
  if (role === 'MODERATOR') return 'orange';
  return 'gray';
}

function preferredEmail(user: User) {
  return (
    user.emails.find((email) => email.verifiedAt) ?? user.emails[0] ?? null
  );
}

const USER_COLUMNS: ColumnDef<User>[] = [
  {
    accessorKey: 'username',
    header: 'Username',
    cell: ({ row }) => <Text fw={600}>{row.original.username}</Text>,
  },
  {
    id: 'name',
    accessorFn: (user) => user.fullName ?? '',
    header: 'Name',
    cell: ({ row }) => (
      <Text size="sm">{row.original.fullName || 'No name'}</Text>
    ),
  },
  {
    id: 'email',
    accessorFn: (user) => user.emails.map(({ email }) => email).join(' '),
    sortingFn: (rowA, rowB) =>
      (preferredEmail(rowA.original)?.email ?? '').localeCompare(
        preferredEmail(rowB.original)?.email ?? '',
      ),
    header: 'Email',
    cell: ({ row }) => {
      const displayEmail = preferredEmail(row.original);
      const hasUnverified = row.original.emails.some(
        (email) => !email.verifiedAt,
      );
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Text size="sm" c="dimmed">
            {displayEmail?.email || 'No email'}
          </Text>
          {hasUnverified ? (
            <Badge size="xs" color="yellow">
              Unverified
            </Badge>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={roleBadgeColor(row.original.role)} size="sm">
          {row.original.role}
        </Badge>
        {row.original.bannedAt ? (
          <Badge color="red" size="sm">
            Banned
          </Badge>
        ) : null}
      </div>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => (
      <Text size="sm" c="dimmed">
        {new Date(row.original.createdAt).toLocaleDateString()}
      </Text>
    ),
  },
  {
    id: 'actions',
    header: 'Actions',
    enableGlobalFilter: false,
    enableSorting: false,
    cell: ({ row, table }) => {
      const meta = table.options.meta as UserTableMeta;
      const user = row.original;
      const hasUnverified = user.emails.some((email) => !email.verifiedAt);
      return (
        <OverflowMenu
          label={`Actions for ${user.fullName?.trim() || user.username}`}
          iconSize={14}
          triggerProps={{ variant: 'light', size: 'sm' }}
        >
          <MenuItemButton
            icon={<IconEdit size={14} />}
            onClick={() => meta.onEdit(user)}
          >
            Edit user
          </MenuItemButton>
          <MenuItemButton
            icon={<IconKey size={14} />}
            onClick={() => meta.onResetPassword(user.id)}
          >
            Reset password
          </MenuItemButton>
          {hasUnverified ? (
            <MenuItemButton
              icon={<IconMail size={14} />}
              onClick={() => meta.onResendVerification(user.id)}
            >
              Resend verification email
            </MenuItemButton>
          ) : null}
          {user.bannedAt ? (
            <MenuItemButton
              icon={<IconLockOpen size={14} />}
              onClick={() => meta.onUnban(user)}
            >
              Unban user
            </MenuItemButton>
          ) : (
            <MenuItemButton
              icon={<IconBan size={14} />}
              onClick={() => meta.onBan(user)}
            >
              Ban user
            </MenuItemButton>
          )}
        </OverflowMenu>
      );
    },
  },
];

function UsersPage() {
  const trpc = useTRPC();
  const [opened, { open, close }] = useDisclosure(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [banOpened, { open: openBan, close: closeBan }] = useDisclosure(false);
  const [banningUser, setBanningUser] = useState<User | null>(null);
  const [banReason, setBanReason] = useState('');

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

  const handleBan = (user: User) => {
    setBanningUser(user);
    setBanReason('');
    openBan();
  };

  const submitBan = async () => {
    if (!banningUser) return;
    try {
      await trpcClient.dashboard.admin.banUser.mutate({
        appUserId: banningUser.id,
        reason: banReason.trim() || undefined,
      });
      closeBan();
      setBanningUser(null);
      refetch();
    } catch (error) {
      console.error('Failed to ban user:', error);
      modals.open({
        title: 'Error',
        children: (
          <Text size="sm" c="red">
            Failed to ban user. Please try again.
          </Text>
        ),
      });
    }
  };

  const handleUnban = (user: User) => {
    modals.openConfirmModal({
      title: 'Unban User',
      children: (
        <Text size="sm">
          Are you sure you want to unban <strong>{user.username}</strong>? They
          will be able to log in again.
        </Text>
      ),
      labels: { confirm: 'Unban User', cancel: 'Cancel' },
      onConfirm: async () => {
        try {
          await trpcClient.dashboard.admin.unbanUser.mutate({
            appUserId: user.id,
          });
          refetch();
        } catch (error) {
          console.error('Failed to unban user:', error);
          modals.open({
            title: 'Error',
            children: (
              <Text size="sm" c="red">
                Failed to unban user. Please try again.
              </Text>
            ),
          });
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <DashboardPageHeader
        eyebrow="Administration · People"
        title="Users"
        description="Review account status, access level, and verification state."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={handleCreate}>
            Add user
          </Button>
        }
      />

      <DataTable
        data={users}
        columns={USER_COLUMNS}
        getRowId={(user) => user.id}
        initialSorting={[{ id: 'createdAt', desc: true }]}
        pageSize={20}
        searchPlaceholder="Search users by name, username, email, or role"
        emptyState="No user accounts match this view."
        meta={{
          onBan: handleBan,
          onEdit: handleEdit,
          onResendVerification: handleResendVerificationEmail,
          onResetPassword: handleResetPassword,
          onUnban: handleUnban,
        }}
      />

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

      <LcModal.Root
        open={banOpened}
        onOpenChange={(o) => {
          if (!o) {
            closeBan();
            setBanningUser(null);
          }
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader
              title={banningUser ? `Ban ${banningUser.username}` : 'Ban User'}
            />
            <div className="flex flex-col gap-4">
              <Text size="sm">
                Banning this user will immediately log them out and prevent them
                from logging back in until they are unbanned.
              </Text>
              <Textarea
                label="Reason (optional)"
                placeholder="Reason for the ban"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                minRows={3}
              />
              <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    closeBan();
                    setBanningUser(null);
                  }}
                >
                  Cancel
                </Button>
                <Button color="red" onClick={submitBan}>
                  Ban User
                </Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>
    </div>
  );
}
