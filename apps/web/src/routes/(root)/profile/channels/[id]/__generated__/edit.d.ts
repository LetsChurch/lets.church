import * as Types from '../../../../../../__generated__/graphql-types';

export type ProfileChannelQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid']['input'];
}>;


export type ProfileChannelQuery = { __typename?: 'Query', channelById: { __typename?: 'Channel', id: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null } };

export type CreateChannelFileUploadMutationVariables = Types.Exact<{
  targetId: Types.Scalars['ShortUuid']['input'];
  bytes: Types.Scalars['SafeInt']['input'];
  uploadMimeType: Types.Scalars['String']['input'];
  postProcess: Types.UploadPostProcess;
}>;


export type CreateChannelFileUploadMutation = { __typename?: 'Mutation', createMultipartUpload: { __typename?: 'MultipartUploadMeta', s3UploadKey: string, s3UploadId: string, partSize: number, urls: Array<string> } };

export type FinalizeAvatarUploadMutationVariables = Types.Exact<{
  targetId: Types.Scalars['ShortUuid']['input'];
  s3UploadKey: Types.Scalars['String']['input'];
  s3UploadId: Types.Scalars['String']['input'];
  s3PartETags: Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input'];
}>;


export type FinalizeAvatarUploadMutation = { __typename?: 'Mutation', finalizeMultipartUpload: boolean };

export type UpdateChannelMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ShortUuid']['input'];
  name: Types.Scalars['String']['input'];
}>;


export type UpdateChannelMutation = { __typename?: 'Mutation', upsertChannel: { __typename?: 'Channel', id: string } };
