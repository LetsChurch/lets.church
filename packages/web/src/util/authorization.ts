import type { AppUserRole } from '@letschurch/db';

/**
 * Base authorization context containing user information
 */
type BaseAuthContext = {
  user: {
    id: string;
    role: AppUserRole;
  };
};

/**
 * Organization membership context
 */
type OrganizationMembership = {
  isAdmin?: boolean;
  canEdit?: boolean;
};

/**
 * Channel membership context
 */
type ChannelMembership = {
  isAdmin?: boolean;
  canEdit?: boolean;
  canUpload?: boolean;
  canDownload?: boolean;
};

/**
 * Organization-specific authorization context
 */
export type OrganizationAuthContext = BaseAuthContext & {
  membership?: OrganizationMembership | null;
};

/**
 * Channel-specific authorization context
 */
export type ChannelAuthContext = BaseAuthContext & {
  membership?: ChannelMembership | null;
};

/**
 * Factory function that creates an authorization policy for organizations.
 * Automatically handles the site admin check, then evaluates the provided check function.
 *
 * @param checkFn - Function that checks if a regular user (non-admin) has permission
 * @returns Authorization policy function that returns true if user is site admin OR passes the check
 *
 * @example
 * ```typescript
 * const canDoSomething = createOrgPolicy(
 *   (ctx) => ctx.membership?.isAdmin === true
 * );
 * ```
 */
function createOrgPolicy(
  checkFn: (ctx: OrganizationAuthContext) => boolean,
): (ctx: OrganizationAuthContext) => boolean {
  return (ctx: OrganizationAuthContext) => {
    // Site admins always pass
    if (ctx.user.role === 'ADMIN') {
      return true;
    }
    // Otherwise, evaluate the check function
    return checkFn(ctx);
  };
}

/**
 * Factory function that creates an authorization policy for channels.
 * Automatically handles the site admin check, then evaluates the provided check function.
 *
 * @param checkFn - Function that checks if a regular user (non-admin) has permission
 * @returns Authorization policy function that returns true if user is site admin OR passes the check
 *
 * @example
 * ```typescript
 * const canDoSomething = createChannelPolicy(
 *   (ctx) => ctx.membership?.canUpload === true
 * );
 * ```
 */
function createChannelPolicy(
  checkFn: (ctx: ChannelAuthContext) => boolean,
): (ctx: ChannelAuthContext) => boolean {
  return (ctx: ChannelAuthContext) => {
    // Site admins always pass
    if (ctx.user.role === 'ADMIN') {
      return true;
    }
    // Otherwise, evaluate the check function
    return checkFn(ctx);
  };
}

/**
 * Organization-specific authorization policies.
 * All policies automatically grant access to site admins.
 *
 * @example
 * ```typescript
 * if (!canOrg.view({ user: ctx.session.appUser, membership })) {
 *   throw new TRPCError({ code: 'UNAUTHORIZED' });
 * }
 * ```
 */
export const canOrg = {
  /**
   * Check if user can view an organization
   * - Site admins can view any organization
   * - Regular users must be members
   */
  view: createOrgPolicy((ctx) => !!ctx.membership),

  /**
   * Check if user can administer an organization
   * - Site admins can administer any organization
   * - Regular users must be organization admins
   */
  administer: createOrgPolicy((ctx) => ctx.membership?.isAdmin === true),

  /**
   * Check if user can edit an organization's content
   * - Site admins can edit any organization
   * - Organization admins can edit
   * - Users with canEdit permission can edit
   */
  edit: createOrgPolicy(
    (ctx) =>
      ctx.membership?.isAdmin === true || ctx.membership?.canEdit === true,
  ),
};

/**
 * Channel-specific authorization policies.
 * All policies automatically grant access to site admins.
 *
 * @example
 * ```typescript
 * if (!canChannel.upload({ user: ctx.session.appUser, membership })) {
 *   throw new TRPCError({ code: 'FORBIDDEN' });
 * }
 * ```
 */
export const canChannel = {
  /**
   * Check if user can view a channel
   * - Site admins can view any channel
   * - Regular users must be members
   */
  view: createChannelPolicy((ctx) => !!ctx.membership),

  /**
   * Check if user can administer a channel
   * - Site admins can administer any channel
   * - Regular users must be channel admins
   */
  administer: createChannelPolicy((ctx) => ctx.membership?.isAdmin === true),

  /**
   * Check if user can edit a channel's content
   * - Site admins can edit any channel
   * - Channel admins can edit
   * - Users with canEdit permission can edit
   */
  edit: createChannelPolicy(
    (ctx) =>
      ctx.membership?.isAdmin === true || ctx.membership?.canEdit === true,
  ),

  /**
   * Check if user can upload to a channel
   * - Site admins can upload to any channel
   * - Channel admins can upload
   * - Users with canUpload permission can upload
   */
  upload: createChannelPolicy(
    (ctx) =>
      ctx.membership?.isAdmin === true || ctx.membership?.canUpload === true,
  ),

  /**
   * Check if user can download original files from a channel
   * - Site admins can download from any channel
   * - Channel admins can download
   * - Users with canDownload permission can download
   */
  download: createChannelPolicy(
    (ctx) =>
      ctx.membership?.isAdmin === true || ctx.membership?.canDownload === true,
  ),
};

/**
 * General authorization utilities
 */
export const can = {
  /**
   * Check if user is a site admin
   * Useful for actions that are ONLY available to site admins
   * (e.g., approving organizations, accessing admin dashboard)
   */
  isSiteAdmin: (ctx: Pick<BaseAuthContext, 'user'>): boolean => {
    return ctx.user.role === 'ADMIN';
  },
};

/**
 * Helper to create organization authorization context from session and membership
 */
export function createOrgAuthContext(
  session: { appUser: { id: string; role: AppUserRole } },
  membership?: OrganizationMembership | null,
): OrganizationAuthContext {
  return {
    user: {
      id: session.appUser.id,
      role: session.appUser.role,
    },
    membership,
  };
}

/**
 * Helper to create channel authorization context from session and membership
 */
export function createChannelAuthContext(
  session: { appUser: { id: string; role: AppUserRole } },
  membership?: ChannelMembership | null,
): ChannelAuthContext {
  return {
    user: {
      id: session.appUser.id,
      role: session.appUser.role,
    },
    membership,
  };
}
