import * as Types from '../../../../__generated__/graphql-types';

export type ProfilePageDataQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type ProfilePageDataQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', id: string, username: string, fullName?: string | null, avatarUrl?: string | null, emails: Array<{ __typename?: 'AppUserEmail', email: string }> } | null };

export type CreateAvatarUploadMutationVariables = Types.Exact<{
  targetId: Types.Scalars['ShortUuid']['input'];
  bytes: Types.Scalars['SafeInt']['input'];
  uploadMimeType: Types.Scalars['String']['input'];
  postProcess: Types.UploadPostProcess;
}>;


export type CreateAvatarUploadMutation = { __typename?: 'Mutation', createMultipartUpload: { __typename?: 'MultipartUploadMeta', s3UploadKey: string, s3UploadId: string, partSize: number, urls: Array<string> } };

export type FinalizeAvatarUploadMutationVariables = Types.Exact<{
  targetId: Types.Scalars['ShortUuid']['input'];
  s3UploadKey: Types.Scalars['String']['input'];
  s3UploadId: Types.Scalars['String']['input'];
  s3PartETags: Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input'];
}>;


export type FinalizeAvatarUploadMutation = { __typename?: 'Mutation', finalizeMultipartUpload: boolean };

export type UpdateUserMutationVariables = Types.Exact<{
  userId: Types.Scalars['ShortUuid']['input'];
  fullName: Types.Scalars['String']['input'];
  email: Types.Scalars['String']['input'];
}>;


export type UpdateUserMutation = { __typename?: 'Mutation', upsertUser: { __typename?: 'AppUser', id: string } };
