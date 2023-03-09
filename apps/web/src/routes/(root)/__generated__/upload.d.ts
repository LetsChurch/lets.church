import * as Types from '../../../__generated__/graphql-types';

export type UploadRouteDataQueryVariables = Types.Exact<{
  id?: Types.InputMaybe<Types.Scalars['ShortUuid']>;
  prefetch: Types.Scalars['Boolean'];
}>;


export type UploadRouteDataQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', channelMembershipsConnection: { __typename?: 'AppUserChannelMembershipsConnection', edges: Array<{ __typename?: 'AppUserChannelMembershipsConnectionEdge', node: { __typename?: 'ChannelMembership', channel: { __typename?: 'Channel', id: string, name: string } } }> } } | null, uploadRecordById?: { __typename?: 'UploadRecord', canMutate: boolean, id: string, title?: string | null, description?: string | null, publishedAt?: string | null, license: Types.UploadLicense, visibility: Types.UploadVisibility, uploadFinalized: boolean, channel: { __typename?: 'Channel', id: string } } };

export type UpsertUploadRecordMutationVariables = Types.Exact<{
  uploadRecordId?: Types.InputMaybe<Types.Scalars['ShortUuid']>;
  title?: Types.InputMaybe<Types.Scalars['String']>;
  description?: Types.InputMaybe<Types.Scalars['String']>;
  publishedAt: Types.Scalars['DateTime'];
  license: Types.UploadLicense;
  visibility: Types.UploadVisibility;
  channelId: Types.Scalars['ShortUuid'];
}>;


export type UpsertUploadRecordMutation = { __typename?: 'Mutation', upsertUploadRecord: { __typename?: 'UploadRecord', id: string } };

export type CreateMultipartMediaUploadMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid'];
  bytes: Types.Scalars['SafeInt'];
  uploadMimeType: Types.Scalars['String'];
  postProcess: Types.UploadPostProcess;
}>;


export type CreateMultipartMediaUploadMutation = { __typename?: 'Mutation', createMultipartMediaUpload: { __typename?: 'MultipartUploadMeta', s3UploadKey: string, s3UploadId: string, partSize: number, urls: Array<string> } };

export type FinalizeUploadMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid'];
  s3UploadKey: Types.Scalars['String'];
  s3UploadId: Types.Scalars['String'];
  s3PartETags: Array<Types.Scalars['String']> | Types.Scalars['String'];
}>;


export type FinalizeUploadMutation = { __typename?: 'Mutation', finalizeUpload: boolean };
