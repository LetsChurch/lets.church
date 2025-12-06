import type { AppUserRole } from '@letschurch/db';
import {
  can,
  canChannel,
  canOrg,
  createChannelAuthContext,
  createOrgAuthContext,
} from './authorization';

/**
 * UI-specific authorization helpers.
 * These functions are designed to be used in React components to determine
 * what UI elements should be shown based on user permissions.
 */

type OrgUIAuthContext = {
  currentUser: {
    id: string;
    role: AppUserRole;
  };
  membership?: {
    isAdmin?: boolean;
    canEdit?: boolean;
  } | null;
};

type ChannelUIAuthContext = {
  currentUser: {
    id: string;
    role: AppUserRole;
  };
  membership?: {
    isAdmin?: boolean;
    canEdit?: boolean;
    canUpload?: boolean;
  } | null;
};

/**
 * Create a permission object for organization UI components
 * @example
 * ```tsx
 * const permissions = getOrganizationPermissions({
 *   currentUser,
 *   membership: organization.userMembership
 * });
 *
 * {permissions.canAdmin && <Button>Add Member</Button>}
 * {permissions.canEdit && <Button>Edit</Button>}
 * ```
 */
export function getOrganizationPermissions(context: OrgUIAuthContext) {
  const authContext = createOrgAuthContext(
    { appUser: context.currentUser },
    context.membership,
  );

  return {
    canView: canOrg.view(authContext),
    canEdit: canOrg.edit(authContext),
    canAdmin: canOrg.administer(authContext),
    isSiteAdmin: can.isSiteAdmin(authContext),
  };
}

/**
 * Create a permission object for channel UI components
 * @example
 * ```tsx
 * const permissions = getChannelPermissions({
 *   currentUser,
 *   membership: channel.userMembership
 * });
 *
 * {permissions.canUpload && <Button>Upload</Button>}
 * {permissions.canAdmin && <Button>Manage Members</Button>}
 * ```
 */
export function getChannelPermissions(context: ChannelUIAuthContext) {
  const authContext = createChannelAuthContext(
    { appUser: context.currentUser },
    context.membership,
  );

  return {
    canView: canChannel.view(authContext),
    canEdit: canChannel.edit(authContext),
    canUpload: canChannel.upload(authContext),
    canAdmin: canChannel.administer(authContext),
    isSiteAdmin: can.isSiteAdmin(authContext),
  };
}
