export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  DateTime: string;
  ShortUuid: string;
  Uuid: string;
};

export type AppUser = {
  __typename?: 'AppUser';
  channelMembershipsConnection: AppUserChannelMembershipsConnection;
  createdAt: Scalars['DateTime'];
  email: Scalars['String'];
  id: Scalars['ShortUuid'];
  organizationMemberhipsConnection: AppUserOrganizationMemberhipsConnection;
  role: AppUserRole;
  updatedAt: Scalars['DateTime'];
  username: Scalars['String'];
};


export type AppUserChannelMembershipsConnectionArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type AppUserOrganizationMemberhipsConnectionArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};

export type AppUserChannelMembershipsConnection = {
  __typename?: 'AppUserChannelMembershipsConnection';
  edges: Array<Maybe<AppUserChannelMembershipsConnectionEdge>>;
  pageInfo: PageInfo;
};

export type AppUserChannelMembershipsConnectionEdge = {
  __typename?: 'AppUserChannelMembershipsConnectionEdge';
  cursor: Scalars['String'];
  node: ChannelMembership;
};

export type AppUserOrganizationMemberhipsConnection = {
  __typename?: 'AppUserOrganizationMemberhipsConnection';
  edges: Array<Maybe<AppUserOrganizationMemberhipsConnectionEdge>>;
  pageInfo: PageInfo;
};

export type AppUserOrganizationMemberhipsConnectionEdge = {
  __typename?: 'AppUserOrganizationMemberhipsConnectionEdge';
  cursor: Scalars['String'];
  node: OrganizationMembership;
};

export enum AppUserRole {
  Admin = 'ADMIN',
  User = 'USER'
}

export type Channel = {
  __typename?: 'Channel';
  createdAt: Scalars['DateTime'];
  description?: Maybe<Scalars['String']>;
  id: Scalars['ShortUuid'];
  membershipsConnection: ChannelMembershipsConnection;
  name: Scalars['String'];
  slug: Scalars['String'];
  updatedAt: Scalars['DateTime'];
};


export type ChannelMembershipsConnectionArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};

export type ChannelMembership = {
  __typename?: 'ChannelMembership';
  canEdit: Scalars['Boolean'];
  canUpload: Scalars['Boolean'];
  channel: Channel;
  isAdmin: Scalars['Boolean'];
  user: AppUser;
};

export type ChannelMembershipsConnection = {
  __typename?: 'ChannelMembershipsConnection';
  edges: Array<Maybe<ChannelMembershipsConnectionEdge>>;
  pageInfo: PageInfo;
};

export type ChannelMembershipsConnectionEdge = {
  __typename?: 'ChannelMembershipsConnectionEdge';
  cursor: Scalars['String'];
  node: ChannelMembership;
};

export type ChannelSearchHit = ISearchHit & {
  __typename?: 'ChannelSearchHit';
  id: Scalars['ShortUuid'];
  name: HighlightedText;
};

export type HighlightedText = {
  __typename?: 'HighlightedText';
  marked: Scalars['String'];
  source: Scalars['String'];
};

export type ISearchHit = {
  id: Scalars['ShortUuid'];
};

export type Mutation = {
  __typename?: 'Mutation';
  createChannel: Channel;
  createOrganization: Organization;
  createUploadRecord: UploadRecord;
  finalizeUpload: Scalars['Boolean'];
  login?: Maybe<AppUser>;
  logout: Scalars['Boolean'];
  signup: AppUser;
  upsertChannelMembership: ChannelMembership;
  upsertOrganizationMembership: OrganizationMembership;
};


export type MutationCreateChannelArgs = {
  name: Scalars['String'];
  slug?: InputMaybe<Scalars['String']>;
};


export type MutationCreateOrganizationArgs = {
  name: Scalars['String'];
  slug?: InputMaybe<Scalars['String']>;
};


export type MutationCreateUploadRecordArgs = {
  channelId: Scalars['ShortUuid'];
  uploadMimeType: Scalars['String'];
};


export type MutationFinalizeUploadArgs = {
  uploadRecordId: Scalars['ShortUuid'];
};


export type MutationLoginArgs = {
  id: Scalars['String'];
  password: Scalars['String'];
};


export type MutationSignupArgs = {
  email: Scalars['String'];
  fullName?: InputMaybe<Scalars['String']>;
  password: Scalars['String'];
  username: Scalars['String'];
};


export type MutationUpsertChannelMembershipArgs = {
  canEdit: Scalars['Boolean'];
  canUpload: Scalars['Boolean'];
  channelId: Scalars['ShortUuid'];
  isAdmin: Scalars['Boolean'];
  userId: Scalars['ShortUuid'];
};


export type MutationUpsertOrganizationMembershipArgs = {
  canEdit: Scalars['Boolean'];
  isAdmin: Scalars['Boolean'];
  organizationId: Scalars['ShortUuid'];
  userId: Scalars['ShortUuid'];
};

export type Organization = {
  __typename?: 'Organization';
  associationsConnection: OrganizationAssociationsConnection;
  createdAt: Scalars['DateTime'];
  description?: Maybe<Scalars['String']>;
  id: Scalars['ShortUuid'];
  membershipsConnection: OrganizationMembershipsConnection;
  name: Scalars['String'];
  slug: Scalars['String'];
  updatedAt: Scalars['DateTime'];
};


export type OrganizationAssociationsConnectionArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type OrganizationMembershipsConnectionArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};

export type OrganizationAssociationsConnection = {
  __typename?: 'OrganizationAssociationsConnection';
  edges: Array<Maybe<OrganizationAssociationsConnectionEdge>>;
  pageInfo: PageInfo;
};

export type OrganizationAssociationsConnectionEdge = {
  __typename?: 'OrganizationAssociationsConnectionEdge';
  cursor: Scalars['String'];
  node: OrganizationChannelAssociation;
};

export type OrganizationChannelAssociation = {
  __typename?: 'OrganizationChannelAssociation';
  channel: Channel;
  organization: Organization;
};

export type OrganizationMembership = {
  __typename?: 'OrganizationMembership';
  channel: Organization;
  isAdmin: Scalars['Boolean'];
  user: AppUser;
};

export type OrganizationMembershipsConnection = {
  __typename?: 'OrganizationMembershipsConnection';
  edges: Array<Maybe<OrganizationMembershipsConnectionEdge>>;
  pageInfo: PageInfo;
};

export type OrganizationMembershipsConnectionEdge = {
  __typename?: 'OrganizationMembershipsConnectionEdge';
  cursor: Scalars['String'];
  node: OrganizationMembership;
};

export type OrganizationSearchHit = ISearchHit & {
  __typename?: 'OrganizationSearchHit';
  id: Scalars['ShortUuid'];
  name: HighlightedText;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']>;
  hasNextPage: Scalars['Boolean'];
  hasPreviousPage: Scalars['Boolean'];
  startCursor?: Maybe<Scalars['String']>;
};

export type Query = {
  __typename?: 'Query';
  channelById: Channel;
  me?: Maybe<AppUser>;
  organizationById: Organization;
  search: SearchConnection;
  uploadRecordById: UploadRecord;
  userById: AppUser;
  usersConnection: QueryUsersConnection;
};


export type QueryChannelByIdArgs = {
  id: Scalars['ShortUuid'];
};


export type QueryOrganizationByIdArgs = {
  id: Scalars['ShortUuid'];
};


export type QuerySearchArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  focus: SearchFocus;
  last?: InputMaybe<Scalars['Int']>;
  query: Scalars['String'];
};


export type QueryUploadRecordByIdArgs = {
  id: Scalars['ShortUuid'];
};


export type QueryUserByIdArgs = {
  id: Scalars['ShortUuid'];
};


export type QueryUsersConnectionArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};

export type QueryUsersConnection = {
  __typename?: 'QueryUsersConnection';
  edges: Array<Maybe<QueryUsersConnectionEdge>>;
  pageInfo: PageInfo;
};

export type QueryUsersConnectionEdge = {
  __typename?: 'QueryUsersConnectionEdge';
  cursor: Scalars['String'];
  node: AppUser;
};

export type SearchAggs = {
  __typename?: 'SearchAggs';
  channelHitCount: Scalars['Int'];
  organizationHitCount: Scalars['Int'];
  transcriptHitCount: Scalars['Int'];
};

export type SearchConnection = {
  __typename?: 'SearchConnection';
  aggs: SearchAggs;
  edges: Array<Maybe<SearchConnectionEdge>>;
  pageInfo: PageInfo;
};

export type SearchConnectionEdge = {
  __typename?: 'SearchConnectionEdge';
  cursor: Scalars['String'];
  node: ISearchHit;
};

export enum SearchFocus {
  Channels = 'CHANNELS',
  Organizations = 'ORGANIZATIONS',
  Transcripts = 'TRANSCRIPTS'
}

export type TranscriptSearchHit = ISearchHit & {
  __typename?: 'TranscriptSearchHit';
  id: Scalars['ShortUuid'];
  moreResultsCount: Scalars['Int'];
  text: HighlightedText;
};

export type TranscriptSentence = {
  __typename?: 'TranscriptSentence';
  confidence: Scalars['Float'];
  end: Scalars['Int'];
  start: Scalars['Int'];
  text: Scalars['String'];
};

export type UploadRecord = {
  __typename?: 'UploadRecord';
  channel: Channel;
  createdAt: Scalars['DateTime'];
  id: Scalars['ShortUuid'];
  transcriptSentences?: Maybe<Array<TranscriptSentence>>;
  updatedAt: Scalars['DateTime'];
  uploadFinalized: Scalars['Boolean'];
  uploadSizeBytes?: Maybe<Scalars['String']>;
  uploadUrl: Scalars['String'];
  uploader: AppUser;
};

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', id: string } | null };

export type LoginMutationVariables = Exact<{
  id: Scalars['String'];
  password: Scalars['String'];
}>;


export type LoginMutation = { __typename?: 'Mutation', login?: { __typename?: 'AppUser', id: string } | null };

export type LogoutMutationVariables = Exact<{ [key: string]: never; }>;


export type LogoutMutation = { __typename?: 'Mutation', logout: boolean };