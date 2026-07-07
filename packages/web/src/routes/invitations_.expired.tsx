import { IconAlertTriangle } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';

import { Alert, Text, Title } from '@/components/ui';

export const Route = createFileRoute('/invitations_/expired')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="bg-page flex min-h-screen justify-center px-4 py-8">
      <div className="w-full max-w-[600px]">
        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <div className="flex flex-col gap-4">
            <Alert
              icon={<IconAlertTriangle size={24} />}
              title="Invitation Expired"
              color="yellow"
            >
              <Text>
                This invitation has expired and can no longer be accepted.
              </Text>
            </Alert>

            <Title order={2}>What happened?</Title>

            <Text>
              Invitations expire after 7 days for security reasons. If you'd
              still like to join, please contact the person who invited you and
              ask them to send a new invitation.
            </Text>

            <div className="mt-4">
              <Link to="/">
                <Text c="blue">Return to home</Text>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
