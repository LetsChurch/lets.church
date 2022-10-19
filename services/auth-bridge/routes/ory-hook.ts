import envariant from '@knpwrs/envariant';
import { GraphQLClient, gql } from 'graphql-request';

const AUTH_BRIDGE_SECRET = envariant('AUTH_BRIDGE_SECRET');
const HASURA_GRAPHQL_ADMIN_SECRET = envariant('HASURA_GRAPHQL_ADMIN_SECRET');
const GRAPHQL_URL = envariant('GRAPHQL_URL');

const upsertUserQuery = gql`
  mutation UpsertUser(
    $id: uuid = ""
    $emails: [AppUserEmailInsertInput!] = {}
  ) {
    insertAppUser(
      objects: {
        id: $id
        emails: {
          data: $emails
          onConflict: {
            constraint: app_user_email_pkey
            update_columns: [id, email, verified, createdAt, updatedAt]
          }
        }
      }
      onConflict: { constraint: app_user_pkey, update_columns: id }
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

  await graphqlClient.request(upsertUserQuery, {
    id: body.userId,
    emails: body.emails,
  });

  return send(event);
});
