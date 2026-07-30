import { createFileRoute, Link, redirect } from '@tanstack/react-router';

import { Button, Text, Title } from '@/components/ui';

import styles from './-styles.module.css';

export const Route = createFileRoute('/_main/dashboard/account')({
  component: AccountPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: () => ({
    backNavigation: {
      label: 'Dashboard',
      to: '/dashboard',
    },
  }),
});

const actionWidth = 140;

function AccountPage() {
  return (
    <>
      <Title order={1} className="mb-5">
        Account Settings
      </Title>

      <div className="flex flex-col gap-5">
        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-4">
            <Text fw={500}>Profile Information</Text>
            <Button
              component={Link}
              to="/dashboard/account/profile"
              variant="light"
              size="sm"
              style={{ width: actionWidth }}
              className={styles.buttonLink}
            >
              Edit
            </Button>
          </div>
          <Text size="sm" c="dimmed">
            Update your personal information and profile settings.
          </Text>
        </div>

        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-4">
            <Text fw={500}>Participation Policies</Text>
            <Button
              component={Link}
              to="/dashboard/account/participation"
              variant="light"
              size="sm"
              style={{ width: actionWidth }}
              className={styles.buttonLink}
            >
              Review
            </Button>
          </div>
          <Text size="sm" c="dimmed">
            Review the policies required to comment or create a channel.
          </Text>
        </div>

        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-4">
            <Text fw={500}>Password & Security</Text>
            <Button
              component={Link}
              to="/dashboard/account/security"
              variant="light"
              size="sm"
              style={{ width: actionWidth }}
              className={styles.buttonLink}
            >
              Change
            </Button>
          </div>
          <Text size="sm" c="dimmed">
            Manage your password and security preferences.
          </Text>
        </div>

        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-4">
            <Text fw={500}>Donations</Text>
            <Button
              component={Link}
              to="/dashboard/account/donations"
              variant="light"
              size="sm"
              style={{ width: actionWidth }}
              className={styles.buttonLink}
            >
              View
            </Button>
          </div>
          <Text size="sm" c="dimmed">
            View receipts, annual statements, and recurring donations.
          </Text>
        </div>

        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-4">
            <Text fw={500}>Newsletter Subscription</Text>
            <Button
              component={Link}
              to="/dashboard/account/newsletter"
              variant="light"
              size="sm"
              style={{ width: actionWidth }}
              className={styles.buttonLink}
            >
              Manage
            </Button>
          </div>
          <Text size="sm" c="dimmed">
            Subscribe or unsubscribe from the Let's Church newsletter.
          </Text>
        </div>

        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-4">
            <Text fw={500}>Notifications</Text>
            <Button
              variant="light"
              size="sm"
              style={{ width: actionWidth }}
              disabled
            >
              Coming Soon
            </Button>
          </div>
          <Text size="sm" c="dimmed">
            Choose what notifications you want to receive.
          </Text>
        </div>
      </div>
    </>
  );
}
