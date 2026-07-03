import { IconInfoCircle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert, Button, Text } from '@/components/ui';
import { useTRPC } from '@/trpc/react';

export default function PendingInvitationsBanner() {
  const trpc = useTRPC();
  const [dismissed, setDismissed] = useState(false);

  const { data: invitations, isLoading } = useQuery({
    ...trpc.common.getPendingInvitations.queryOptions(),
    // Refetch every 5 minutes to catch new invitations
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading || !invitations || invitations.length === 0 || dismissed) {
    return null;
  }

  const firstInvitation = invitations[0];
  const remainingCount = invitations.length - 1;

  // Determine the type suffix based on all invitation types
  const types = new Set(invitations.map((inv) => inv.type));
  const isMixedTypes = types.size > 1;
  const isSingular = invitations.length === 1;

  const getTypeSuffix = () => {
    if (isMixedTypes) {
      return ''; // Neutral - no type suffix for mixed types
    }
    const type = firstInvitation.type;
    if (type === 'organization') {
      return isSingular ? ' to an organization' : ' to organizations';
    }
    return isSingular ? ' to a channel' : ' to channels';
  };

  return (
    <Alert
      color="blue"
      icon={<IconInfoCircle />}
      className="rounded-none border-x-0 border-t-0"
      withCloseButton
      onClose={() => setDismissed(true)}
    >
      <div className="flex flex-nowrap items-center justify-between gap-4">
        <Text size="sm">
          You have {invitations.length} pending invitation
          {invitations.length > 1 ? 's' : ''}
          {getTypeSuffix()}.{' '}
          {remainingCount > 0 ? (
            <span>
              View invitation to <strong>{firstInvitation.name}</strong>
              {remainingCount > 0 ? ` and ${remainingCount} more` : ''}.
            </span>
          ) : (
            <span>
              View invitation to <strong>{firstInvitation.name}</strong>.
            </span>
          )}
        </Text>
        <Button
          component={Link}
          to="/dashboard/invitations"
          size="xs"
          variant="light"
        >
          View Invitations
        </Button>
      </div>
    </Alert>
  );
}
