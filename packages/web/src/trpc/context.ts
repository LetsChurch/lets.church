import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { getSession } from '@/util/auth';
import {
  type ChannelAuthContext,
  canChannel,
  canOrg,
  createChannelAuthContext,
  createOrgAuthContext,
  type OrganizationAuthContext,
} from '@/util/authorization';

export async function createContext({
  req,
  resHeaders,
}: FetchCreateContextFnOptions) {
  const session = await getSession();

  // Create authorization helpers that can be used with membership data
  const createAuthHelpers = () => {
    if (!session) {
      return undefined;
    }

    return {
      /**
       * Create organization authorization checker for the current user
       * @example
       * ```typescript
       * const canViewOrg = ctx.auth.org(membership).view();
       * if (!canViewOrg) throw new TRPCError({ code: 'UNAUTHORIZED' });
       * ```
       */
      org: (membership?: OrganizationAuthContext['membership']) => {
        const authContext = createOrgAuthContext(session, membership);
        return {
          view: () => canOrg.view(authContext),
          administer: () => canOrg.administer(authContext),
          edit: () => canOrg.edit(authContext),
        };
      },

      /**
       * Create channel authorization checker for the current user
       * @example
       * ```typescript
       * const canUploadToChannel = ctx.auth.channel(membership).upload();
       * if (!canUploadToChannel) throw new TRPCError({ code: 'FORBIDDEN' });
       * ```
       */
      channel: (membership?: ChannelAuthContext['membership']) => {
        const authContext = createChannelAuthContext(session, membership);
        return {
          view: () => canChannel.view(authContext),
          administer: () => canChannel.administer(authContext),
          edit: () => canChannel.edit(authContext),
          upload: () => canChannel.upload(authContext),
        };
      },
    };
  };

  return {
    session,
    req,
    resHeaders,
    auth: createAuthHelpers(),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
