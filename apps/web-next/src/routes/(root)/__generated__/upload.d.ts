import * as Types from '../../../__generated__/graphql-types';

export type UploadRouteDataQueryVariables = Types.Exact<{
  id?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  prefetch: Types.Scalars['Boolean']['input'];
}>;


export type UploadRouteDataQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', canUpload: boolean, channelMembershipsConnection: { __typename?: 'AppUserChannelMembershipsConnection', edges: Array<{ __typename?: 'AppUserChannelMembershipsConnectionEdge', node: { __typename?: 'ChannelMembership', channel: { __typename?: 'Channel', id: string, name: string } } }> } } | null, uploadRecordById?: { __typename?: 'UploadRecord', canMutate: boolean, id: string, title?: string | null, description?: string | null, publishedAt?: string | null, license: Types.UploadLicense, visibility: Types.UploadVisibility, userCommentsEnabled: boolean, downloadsEnabled: boolean, uploadFinalized: boolean, channel: { __typename?: 'Channel', id: string } } };

export type UpsertUploadRecordMutationVariables = Types.Exact<{
  uploadRecordId?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  title?: Types.InputMaybe<Types.Scalars['String']['input']>;
  description?: Types.InputMaybe<Types.Scalars['String']['input']>;
  publishedAt: Types.Scalars['DateTime']['input'];
  license: Types.UploadLicense;
  visibility: Types.UploadVisibility;
  userCommentsEnabled: Types.Scalars['Boolean']['input'];
  downloadsEnabled: Types.Scalars['Boolean']['input'];
  channelId: Types.Scalars['ShortUuid']['input'];
}>;


export type UpsertUploadRecordMutation = { __typename?: 'Mutation', upsertUploadRecord: { __typename?: 'UploadRecord', id: string } };

export type CreateMultipartMediaUploadMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid']['input'];
  bytes: Types.Scalars['SafeInt']['input'];
  uploadMimeType: Types.Scalars['String']['input'];
  postProcess: Types.UploadPostProcess;
}>;


export type CreateMultipartMediaUploadMutation = { __typename?: 'Mutation', createMultipartUpload: { __typename?: 'MultipartUploadMeta', s3UploadKey: string, s3UploadId: string, partSize: number, urls: Array<string> } };

export type FinalizeMediaUploadMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid']['input'];
  s3UploadKey: Types.Scalars['String']['input'];
  s3UploadId: Types.Scalars['String']['input'];
  s3PartETags: Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input'];
}>;


export type FinalizeMediaUploadMutation = { __typename?: 'Mutation', finalizeMultipartUpload: boolean };
