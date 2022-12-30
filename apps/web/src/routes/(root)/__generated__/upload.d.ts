import * as Types from '../../../__generated__/graphql-types.d';

export type UploadRouteDataQueryVariables = Types.Exact<{
  id?: Types.InputMaybe<Types.Scalars['ShortUuid']>;
  prefetch: Types.Scalars['Boolean'];
}>;


export type UploadRouteDataQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', channelMembershipsConnection: { __typename?: 'AppUserChannelMembershipsConnection', edges: Array<{ __typename?: 'AppUserChannelMembershipsConnectionEdge', node: { __typename?: 'ChannelMembership', channel: { __typename?: 'Channel', id: any, name: string } } }> } } | null, uploadRecordById?: { __typename?: 'UploadRecord', canMutate: boolean, id: any, title?: string | null, channel: { __typename?: 'Channel', id: any } } };

export type UpsertUploadRecordMutationVariables = Types.Exact<{
  uploadRecordId?: Types.InputMaybe<Types.Scalars['ShortUuid']>;
  title?: Types.InputMaybe<Types.Scalars['String']>;
  description?: Types.InputMaybe<Types.Scalars['String']>;
  channelId: Types.Scalars['ShortUuid'];
}>;


export type UpsertUploadRecordMutation = { __typename?: 'Mutation', upsertUploadRecord: { __typename?: 'UploadRecord', id: any } };

export type CreateMultipartMediaUploadMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid'];
  bytes: Types.Scalars['SafeInt'];
  uploadMimeType: Types.Scalars['String'];
}>;


export type CreateMultipartMediaUploadMutation = { __typename?: 'Mutation', createMultipartMediaUpload: { __typename?: 'MultipartUploadMeta', s3UploadKey: string, s3UploadId: string, partSize: number, urls: Array<string> } };

export type FinalizeUploadMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid'];
  s3UploadKey: Types.Scalars['String'];
  s3UploadId: Types.Scalars['String'];
  s3PartETags: Array<Types.Scalars['String']> | Types.Scalars['String'];
}>;


export type FinalizeUploadMutation = { __typename?: 'Mutation', finalizeUpload: boolean };
