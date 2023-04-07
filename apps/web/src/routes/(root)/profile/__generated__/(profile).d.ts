import * as Types from '../../../../__generated__/graphql-types';

export type ProfilePageDataQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type ProfilePageDataQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', id: string, username: string, fullName?: string | null, email: string, avatarUrl?: string | null } | null };

export type CreateAvatarUploadMutationVariables = Types.Exact<{
  targetId: Types.Scalars['ShortUuid'];
  bytes: Types.Scalars['SafeInt'];
  uploadMimeType: Types.Scalars['String'];
  postProcess: Types.UploadPostProcess;
}>;


export type CreateAvatarUploadMutation = { __typename?: 'Mutation', createMultipartUpload: { __typename?: 'MultipartUploadMeta', s3UploadKey: string, s3UploadId: string, partSize: number, urls: Array<string> } };

export type FinalizeAvatarUploadMutationVariables = Types.Exact<{
  targetId: Types.Scalars['ShortUuid'];
  s3UploadKey: Types.Scalars['String'];
  s3UploadId: Types.Scalars['String'];
  s3PartETags: Array<Types.Scalars['String']> | Types.Scalars['String'];
}>;


export type FinalizeAvatarUploadMutation = { __typename?: 'Mutation', finalizeMultipartUpload: boolean };

export type UpdateUserMutationVariables = Types.Exact<{
  userId: Types.Scalars['ShortUuid'];
  fullName: Types.Scalars['String'];
  email: Types.Scalars['String'];
}>;


export type UpdateUserMutation = { __typename?: 'Mutation', updateUser: { __typename?: 'AppUser', id: string } };
