import * as Types from '../../../../../__generated__/graphql-types';

export type AdminChannelEditRouteDataQueryVariables = Types.Exact<{
  id?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  prefetch: Types.Scalars['Boolean']['input'];
}>;


export type AdminChannelEditRouteDataQuery = { __typename?: 'Query', channelById?: { __typename?: 'Channel', id: string, name: string, slug: string, description?: string | null } };

export type AdminUpsertChannelMutationVariables = Types.Exact<{
  channelId?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  name: Types.Scalars['String']['input'];
  slug: Types.Scalars['String']['input'];
  description?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type AdminUpsertChannelMutation = { __typename?: 'Mutation', upsertChannel: { __typename?: 'Channel', id: string } };
