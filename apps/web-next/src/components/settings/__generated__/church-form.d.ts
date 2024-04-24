import * as Types from '../../../__generated__/graphql-types';

export type UpsertOrganizationMutationVariables = Types.Exact<{
  id?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  name: Types.Scalars['String']['input'];
  slug: Types.Scalars['String']['input'];
  about?: Types.InputMaybe<Types.Scalars['String']['input']>;
  primaryEmail?: Types.InputMaybe<Types.Scalars['String']['input']>;
  primaryPhoneNumber?: Types.InputMaybe<Types.Scalars['String']['input']>;
  addresses?: Types.InputMaybe<Array<Types.AddressInput> | Types.AddressInput>;
  leaders?: Types.InputMaybe<Array<Types.OrganizationLeaderInput> | Types.OrganizationLeaderInput>;
}>;


export type UpsertOrganizationMutation = { __typename?: 'Mutation', upsertOrganization: { __typename?: 'Organization', id: string } };
