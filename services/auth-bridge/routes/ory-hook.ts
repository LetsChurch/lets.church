import envariant from '@knpwrs/envariant';
import { GraphQLClient, gql } from 'graphql-request';

const AUTH_BRIDGE_SECRET = envariant('AUTH_BRIDGE_SECRET');
const HASURA_GRAPHQL_ADMIN_SECRET = envariant('HASURA_GRAPHQL_ADMIN_SECRET');
const GRAPHQL_URL = envariant('GRAPHQL_URL');

const upsertUserQuery = gql`
  mutation UpsertUser($id: uuid!, $email: citext!) {
    insertAppUser(
      objects: { id: $id, email: $email }
      onConflict: { constraint: app_user_pkey, update_columns: [email] }
    ) {
      affected_rows
    }
  }
`;

const graphqlClient = new GraphQLClient(GRAPHQL_URL, {
  headers: {
    'x-hasura-role': 'internal',
    'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET,
    'x-hasura-use-backend-only-permissions': 'true',
  },
  fetch, // Ensure native fetch is used
});

export default eventHandler(async (event) => {
  const auth = getHeader(event, 'authorization');
  if (auth !== AUTH_BRIDGE_SECRET) {
    throw sendError(
      event,
      createError({ statusCode: 401, message: 'Invalid secret' }),
    );
  }

  const body = await useBody(event);

  graphqlClient.request(upsertUserQuery, {
    id: body.userId,
    email: body.email,
  });

  return send(event);
});
