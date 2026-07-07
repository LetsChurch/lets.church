import { IconX } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';

import { Alert, List, Text, Title } from '@/components/ui';

export const Route = createFileRoute('/invitations_/invalid')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="bg-page flex min-h-screen justify-center px-4 py-8">
      <div className="w-full max-w-[600px]">
        <div className="border-fancy-pants overflow-hidden rounded-lg bg-white p-5 shadow-sm dark:bg-zinc-900">
          <div className="flex flex-col gap-4">
            <Alert
              icon={<IconX size={24} />}
              title="Invalid Invitation"
              color="red"
            >
              <Text>
                This invitation link is not valid or has already been used.
              </Text>
            </Alert>

            <Title order={2}>Why might this happen?</Title>

            <List>
              <List.Item>
                The invitation link is incorrect or incomplete
              </List.Item>
              <List.Item>
                The invitation has already been accepted or declined
              </List.Item>
              <List.Item>
                The invitation was cancelled by an administrator
              </List.Item>
              <List.Item>The link is expired</List.Item>
            </List>

            <Text className="mt-4">
              If you believe this is an error, please contact the person who
              invited you.
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
