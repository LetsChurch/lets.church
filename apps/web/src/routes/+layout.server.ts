import { getClient, gql } from '../util/graphql-request';
import type { MeQuery } from '../__generated__/graphql-types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  const client = getClient(event);

  const res = await client.request<MeQuery>(
    gql`
      query Me {
        me {
          id
        }
      }
    `,
  );

  return res;
};
