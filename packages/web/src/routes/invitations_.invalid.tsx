import { Alert, Box, Card, List, Stack, Text, Title } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/invitations_/invalid')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Box p="xl" style={{ maxWidth: 600, margin: '0 auto' }}>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
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

          <Text mt="md">
            If you believe this is an error, please contact the person who
            invited you.
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
