import { Alert, Box, Card, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/invitations_/expired')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Box p="xl" style={{ maxWidth: 600, margin: '0 auto' }}>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
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
            Invitations expire after 7 days for security reasons. If you'd still
            like to join, please contact the person who invited you and ask them
            to send a new invitation.
          </Text>

          <Box mt="md">
            <Link to="/">
              <Text c="blue">Return to home</Text>
            </Link>
          </Box>
        </Stack>
      </Card>
    </Box>
  );
}
