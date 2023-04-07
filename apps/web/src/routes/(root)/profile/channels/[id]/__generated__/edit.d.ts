import * as Types from '../../../../../../__generated__/graphql-types';

export type ProfileChannelQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
}>;


export type ProfileChannelQuery = { __typename?: 'Query', channelById: { __typename?: 'Channel', id: string, name: string, avatarUrl?: string | null } };

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

export type UpdateChannelMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ShortUuid'];
  name: Types.Scalars['String'];
}>;


export type UpdateChannelMutation = { __typename?: 'Mutation', updateChannel: { __typename?: 'Channel', id: string } };
