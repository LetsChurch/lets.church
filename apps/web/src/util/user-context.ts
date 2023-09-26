import { createContext, type Resource, useContext } from 'solid-js';
import type { MeQuery } from '~/routes/__generated__/(root)';

export const UserContext = createContext<Resource<MeQuery | undefined>>();

export const useUser = () => {
  const user = useContext(UserContext);
  return () => user?.()?.me ?? null;
};
