import * as Z from 'zod';
import envariant from '@knpwrs/envariant';
import { gql, GraphQLClient } from 'graphql-request';

const AUTH_HOOKS_SECRET = envariant('AUTH_HOOKS_SECRET');
const ORY_KRATOS_ADMIN_URL = envariant('ORY_KRATOS_ADMIN_URL');
const GATEWAY_GRAPHQL_URL = envariant('GATEWAY_GRAPHQL_URL');

const syncUserProfileMutation = gql`
  mutation SyncUserProfile($id: Uuid!) {
    syncUserProfile(id: $id)
  }
`;

const graphqlClient = new GraphQLClient(GATEWAY_GRAPHQL_URL, {
  headers: {
    authorization: AUTH_HOOKS_SECRET,
  },
  fetch, // Ensure native fetch is used
});

const transformSchema = Z.object({
  id: Z.string().uuid(),
})
  .passthrough()
  .transform((o) => ({
    ...o,
    metadata_public: {
      role: 'user',
    },
  }));

export default eventHandler(async (event) => {
  const incoming = await useBody(event);
  const outgoing = transformSchema.parse(incoming);

  // 1. Set role
  const res = await fetch(`${ORY_KRATOS_ADMIN_URL}/identities/${outgoing.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(outgoing),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  // 2. Upsert user in app
  await graphqlClient.request(syncUserProfileMutation, { id: outgoing.id });

  // 3. Respond 204
  return null;
});
