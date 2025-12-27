import type { ComponentPropsWithoutRef } from 'react';
import { PillButton } from './pill-button';

type FollowButtonProps = Omit<
  ComponentPropsWithoutRef<'button'>,
  'children'
> & {
  isFollowing?: boolean;
  size?: 'sm' | 'lg';
};

export function FollowButton({
  isFollowing = false,
  size = 'lg',
  ...props
}: FollowButtonProps) {
  return (
    <PillButton
      variant={isFollowing ? 'ghost' : 'brand'}
      size={size}
      {...props}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </PillButton>
  );
}
