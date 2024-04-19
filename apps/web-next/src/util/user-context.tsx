import { Navigate } from '@solidjs/router';
import {
  type JSX,
  Show,
  createContext,
  useContext,
  type Accessor,
} from 'solid-js';
import { AppUserRole } from '~/__generated__/graphql-types';
import type { MeQuery } from '~/routes/__generated__/(root)';

export const UserContext = createContext<Accessor<MeQuery | undefined>>();

export const useUser = () => {
  const user = useContext(UserContext);
  return () => user?.()?.me ?? null;
};

export function RequireUser(props: {
  // User doesn't need to be reactive in the children because this component will immediately fall back to a redirect
  // in the only case where the user can change, hence unwrapping the signal.
  children: (
    u: Exclude<ReturnType<ReturnType<typeof useUser>>, null>,
  ) => JSX.Element;
  requireAdmin?: boolean;
}) {
  const user = useUser();

  const getCondition = () => {
    const u = user();

    if (u && props.requireAdmin && u.role !== AppUserRole.Admin) {
      return null;
    }

    return u;
  };

  return (
    <Show when={getCondition()} fallback={<Navigate href="/" />} keyed>
      {(u) => props.children(u)}
    </Show>
  );
}
