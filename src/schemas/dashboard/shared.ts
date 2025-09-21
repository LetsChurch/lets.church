import { z } from 'zod';

export const AvatarSize = z.enum(['standard']).optional().default('standard');

export function getAvatarSize(_size?: z.infer<typeof AvatarSize>) {
  return { width: 120, height: 120 };
}
