export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: string; output: string; }
  Jwt: { input: string; output: string; }
  SafeInt: { input: number; output: number; }
  ShortUuid: { input: string; output: string; }
  Uuid: { input: string; output: string; }
};

export type AppUser = {
  __typename?: 'AppUser';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  canUpload: Scalars['Boolean']['output'];
  channelMembershipsConnection: AppUserChannelMembershipsConnection;
  channelSubscriptionsConnection: AppUserChannelSubscriptionsConnection;
  createdAt: Scalars['DateTime']['output'];
  emails: Array<AppUserEmail>;
  fullName?: Maybe<Scalars['String']['output']>;
  id: Scalars['ShortUuid']['output'];
  organizationMemberhipsConnection: AppUserOrganizationMemberhipsConnection;
  playlists: AppUserPlaylistsConnection;
  role: AppUserRole;
  subscribedToNewsletter: Scalars['Boolean']['output'];
  updatedAt: Scalars['DateTime']['output'];
  username: Scalars['String']['output'];
};


export type AppUserAvatarUrlArgs = {
  resize?: InputMaybe<ResizeParams>;
};


export type AppUserChannelMembershipsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  canUpload?: InputMaybe<Scalars['Boolean']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type AppUserChannelSubscriptionsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type AppUserOrganizationMemberhipsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type AppUserPlaylistsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

export type AppUserChannelMembershipsConnection = {
  __typename?: 'AppUserChannelMembershipsConnection';
  edges: Array<AppUserChannelMembershipsConnectionEdge>;
  pageInfo: PageInfo;
};

export type AppUserChannelMembershipsConnectionEdge = {
  __typename?: 'AppUserChannelMembershipsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ChannelMembership;
};

export type AppUserChannelSubscriptionsConnection = {
  __typename?: 'AppUserChannelSubscriptionsConnection';
  edges: Array<AppUserChannelSubscriptionsConnectionEdge>;
  pageInfo: PageInfo;
};

export type AppUserChannelSubscriptionsConnectionEdge = {
  __typename?: 'AppUserChannelSubscriptionsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ChannelSubscription;
};

export type AppUserEmail = {
  __typename?: 'AppUserEmail';
  email: Scalars['String']['output'];
  id: Scalars['ShortUuid']['output'];
  verifiedAt?: Maybe<Scalars['DateTime']['output']>;
};

export type AppUserOrganizationMemberhipsConnection = {
  __typename?: 'AppUserOrganizationMemberhipsConnection';
  edges: Array<AppUserOrganizationMemberhipsConnectionEdge>;
  pageInfo: PageInfo;
};

export type AppUserOrganizationMemberhipsConnectionEdge = {
  __typename?: 'AppUserOrganizationMemberhipsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: OrganizationMembership;
};

export type AppUserPlaylistsConnection = {
  __typename?: 'AppUserPlaylistsConnection';
  edges: Array<AppUserPlaylistsConnectionEdge>;
  pageInfo: PageInfo;
};

export type AppUserPlaylistsConnectionEdge = {
  __typename?: 'AppUserPlaylistsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: UploadList;
};

export enum AppUserRole {
  Admin = 'ADMIN',
  User = 'USER'
}

export type Channel = {
  __typename?: 'Channel';
  avatarUrl?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  defaultThumbnailBlurhash?: Maybe<Scalars['String']['output']>;
  defaultThumbnailUrl?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ShortUuid']['output'];
  membershipsConnection: ChannelMembershipsConnection;
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  subscribersConnection: ChannelSubscribersConnection;
  updatedAt: Scalars['DateTime']['output'];
  uploadsConnection: ChannelUploadsConnection;
  userIsSubscribed: Scalars['Boolean']['output'];
};


export type ChannelAvatarUrlArgs = {
  resize?: InputMaybe<ResizeParams>;
};


export type ChannelDefaultThumbnailUrlArgs = {
  resize?: InputMaybe<ResizeParams>;
};


export type ChannelMembershipsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type ChannelSubscribersConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type ChannelUploadsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  includeUnlisted?: InputMaybe<Scalars['Boolean']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  order?: Order;
  orderBy?: UploadOrderProperty;
};

export type ChannelEntry = {
  __typename?: 'ChannelEntry';
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
};

export type ChannelMembership = {
  __typename?: 'ChannelMembership';
  canEdit: Scalars['Boolean']['output'];
  canUpload: Scalars['Boolean']['output'];
  channel: Channel;
  isAdmin: Scalars['Boolean']['output'];
  user: AppUser;
};

export type ChannelMembershipsConnection = {
  __typename?: 'ChannelMembershipsConnection';
  edges: Array<ChannelMembershipsConnectionEdge>;
  pageInfo: PageInfo;
};

export type ChannelMembershipsConnectionEdge = {
  __typename?: 'ChannelMembershipsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ChannelMembership;
};

export type ChannelSearchHit = ISearchHit & {
  __typename?: 'ChannelSearchHit';
  channel: Channel;
  id: Scalars['ShortUuid']['output'];
  name: Scalars['String']['output'];
};

export type ChannelSubscribersConnection = {
  __typename?: 'ChannelSubscribersConnection';
  edges: Array<ChannelSubscribersConnectionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type ChannelSubscribersConnectionEdge = {
  __typename?: 'ChannelSubscribersConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ChannelSubscription;
};

export type ChannelSubscription = {
  __typename?: 'ChannelSubscription';
  channel: Channel;
  user: AppUser;
};

export type ChannelUploadsConnection = {
  __typename?: 'ChannelUploadsConnection';
  edges: Array<ChannelUploadsConnectionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type ChannelUploadsConnectionEdge = {
  __typename?: 'ChannelUploadsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: UploadRecord;
};

export type DataError = {
  __typename?: 'DataError';
  error: PrismaRuntimeError;
};

export type HighlightedText = {
  __typename?: 'HighlightedText';
  marked: Scalars['String']['output'];
  source: Scalars['String']['output'];
};

export type ISearchHit = {
  id: Scalars['ShortUuid']['output'];
};

export type MediaDownload = {
  __typename?: 'MediaDownload';
  kind: MediaDownloadKind;
  label: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export enum MediaDownloadKind {
  Audio = 'AUDIO',
  TranscriptTxt = 'TRANSCRIPT_TXT',
  TranscriptVtt = 'TRANSCRIPT_VTT',
  Video_4K = 'VIDEO_4K',
  Video_360P = 'VIDEO_360P',
  Video_480P = 'VIDEO_480P',
  Video_720P = 'VIDEO_720P',
  Video_1080P = 'VIDEO_1080P'
}

export type MultipartUploadMeta = {
  __typename?: 'MultipartUploadMeta';
  partSize: Scalars['Int']['output'];
  s3UploadId: Scalars['String']['output'];
  s3UploadKey: Scalars['String']['output'];
  urls: Array<Scalars['String']['output']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  addUploadToList: UploadList;
  createChannel: Channel;
  createMultipartUpload: MultipartUploadMeta;
  createOrganization: Organization;
  createUploadList: UploadList;
  finalizeMultipartUpload: Scalars['Boolean']['output'];
  forgotPassword: Scalars['Boolean']['output'];
  login?: Maybe<Scalars['Jwt']['output']>;
  logout: Scalars['Boolean']['output'];
  rateComment: Scalars['Boolean']['output'];
  rateUpload: Scalars['Boolean']['output'];
  recordUploadRangesView: Scalars['Uuid']['output'];
  recordUploadView: Scalars['Boolean']['output'];
  register: MutationRegisterResult;
  resetPassword: Scalars['Boolean']['output'];
  subscribeToChannel: ChannelSubscription;
  subscribeToNewsletter: MutationSubscribeToNewsletterResult;
  unsubscribeFromChannel: Scalars['Boolean']['output'];
  unsubscribeFromNewsletter: Scalars['Boolean']['output'];
  updateChannel: Channel;
  updateUser: AppUser;
  upsertChannelMembership: ChannelMembership;
  upsertOrganizationMembership: OrganizationMembership;
  upsertUploadRecord: UploadRecord;
  upsertUploadUserComment: UploadUserComment;
  verifyEmail: Scalars['Boolean']['output'];
  verifyNewsletterSubscription: Scalars['Boolean']['output'];
};


export type MutationAddUploadToListArgs = {
  after?: InputMaybe<Scalars['ShortUuid']['input']>;
  before?: InputMaybe<Scalars['ShortUuid']['input']>;
  uploadListId: Scalars['ShortUuid']['input'];
  uploadRecordId: Scalars['ShortUuid']['input'];
};


export type MutationCreateChannelArgs = {
  name: Scalars['String']['input'];
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateMultipartUploadArgs = {
  bytes: Scalars['SafeInt']['input'];
  postProcess: UploadPostProcess;
  targetId: Scalars['ShortUuid']['input'];
  uploadMimeType: Scalars['String']['input'];
};


export type MutationCreateOrganizationArgs = {
  name: Scalars['String']['input'];
  slug?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateUploadListArgs = {
  channelId?: InputMaybe<Scalars['ShortUuid']['input']>;
  title: Scalars['String']['input'];
  type: UploadListType;
};


export type MutationFinalizeMultipartUploadArgs = {
  s3PartETags: Array<Scalars['String']['input']>;
  s3UploadId: Scalars['String']['input'];
  s3UploadKey: Scalars['String']['input'];
  targetId: Scalars['ShortUuid']['input'];
};


export type MutationForgotPasswordArgs = {
  email: Scalars['String']['input'];
};


export type MutationLoginArgs = {
  id: Scalars['String']['input'];
  password: Scalars['String']['input'];
};


export type MutationRateCommentArgs = {
  rating: Rating;
  uploadUserCommentId: Scalars['ShortUuid']['input'];
};


export type MutationRateUploadArgs = {
  rating: Rating;
  uploadRecordId: Scalars['ShortUuid']['input'];
};


export type MutationRecordUploadRangesViewArgs = {
  ranges: Array<TimeRange>;
  uploadRecordId: Scalars['ShortUuid']['input'];
  viewId?: InputMaybe<Scalars['Uuid']['input']>;
};


export type MutationRecordUploadViewArgs = {
  uploadRecordId: Scalars['ShortUuid']['input'];
};


export type MutationRegisterArgs = {
  agreeToTerms: Scalars['Boolean']['input'];
  agreeToTheology: Scalars['Boolean']['input'];
  email: Scalars['String']['input'];
  fullName?: InputMaybe<Scalars['String']['input']>;
  password: Scalars['String']['input'];
  subscribeToNewsletter?: InputMaybe<Scalars['Boolean']['input']>;
  username: Scalars['String']['input'];
};


export type MutationResetPasswordArgs = {
  id: Scalars['Uuid']['input'];
  password: Scalars['String']['input'];
};


export type MutationSubscribeToChannelArgs = {
  channelId: Scalars['ShortUuid']['input'];
};


export type MutationSubscribeToNewsletterArgs = {
  email: Scalars['String']['input'];
};


export type MutationUnsubscribeFromChannelArgs = {
  channelId: Scalars['ShortUuid']['input'];
};


export type MutationUnsubscribeFromNewsletterArgs = {
  emailKey: Scalars['ShortUuid']['input'];
  subscriptionId: Scalars['ShortUuid']['input'];
};


export type MutationUpdateChannelArgs = {
  channelId: Scalars['ShortUuid']['input'];
  name: Scalars['String']['input'];
};


export type MutationUpdateUserArgs = {
  email: Scalars['String']['input'];
  fullName: Scalars['String']['input'];
  userId: Scalars['ShortUuid']['input'];
};


export type MutationUpsertChannelMembershipArgs = {
  canEdit: Scalars['Boolean']['input'];
  canUpload: Scalars['Boolean']['input'];
  channelId: Scalars['ShortUuid']['input'];
  isAdmin: Scalars['Boolean']['input'];
  userId: Scalars['ShortUuid']['input'];
};


export type MutationUpsertOrganizationMembershipArgs = {
  canEdit: Scalars['Boolean']['input'];
  isAdmin: Scalars['Boolean']['input'];
  organizationId: Scalars['ShortUuid']['input'];
  userId: Scalars['ShortUuid']['input'];
};


export type MutationUpsertUploadRecordArgs = {
  channelId: Scalars['ShortUuid']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  downloadsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  license: UploadLicense;
  publishedAt: Scalars['DateTime']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
  uploadRecordId?: InputMaybe<Scalars['ShortUuid']['input']>;
  userCommentsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  visibility: UploadVisibility;
};


export type MutationUpsertUploadUserCommentArgs = {
  commentId?: InputMaybe<Scalars['ShortUuid']['input']>;
  replyingTo?: InputMaybe<Scalars['ShortUuid']['input']>;
  text: Scalars['String']['input'];
  uploadRecordId: Scalars['ShortUuid']['input'];
};


export type MutationVerifyEmailArgs = {
  emailId: Scalars['ShortUuid']['input'];
  emailKey: Scalars['ShortUuid']['input'];
  userId: Scalars['ShortUuid']['input'];
};


export type MutationVerifyNewsletterSubscriptionArgs = {
  emailKey: Scalars['ShortUuid']['input'];
  subscriptionId: Scalars['ShortUuid']['input'];
};

export type MutationRegisterResult = DataError | MutationRegisterSuccess | ValidationError;

export type MutationRegisterSuccess = {
  __typename?: 'MutationRegisterSuccess';
  data: AppUser;
};

export type MutationSubscribeToNewsletterResult = MutationSubscribeToNewsletterSuccess | ValidationError;

export type MutationSubscribeToNewsletterSuccess = {
  __typename?: 'MutationSubscribeToNewsletterSuccess';
  data: Scalars['Boolean']['output'];
};

export enum Order {
  Asc = 'asc',
  Desc = 'desc'
}

export type Organization = {
  __typename?: 'Organization';
  associationsConnection: OrganizationAssociationsConnection;
  createdAt: Scalars['DateTime']['output'];
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ShortUuid']['output'];
  membershipsConnection: OrganizationMembershipsConnection;
  name: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};


export type OrganizationAssociationsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type OrganizationMembershipsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

export type OrganizationAssociationsConnection = {
  __typename?: 'OrganizationAssociationsConnection';
  edges: Array<OrganizationAssociationsConnectionEdge>;
  pageInfo: PageInfo;
};

export type OrganizationAssociationsConnectionEdge = {
  __typename?: 'OrganizationAssociationsConnectionEdge';
  cursor: Scalars['String']['output'];
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
  isAdmin: Scalars['Boolean']['output'];
  user: AppUser;
};

export type OrganizationMembershipsConnection = {
  __typename?: 'OrganizationMembershipsConnection';
  edges: Array<OrganizationMembershipsConnectionEdge>;
  pageInfo: PageInfo;
};

export type OrganizationMembershipsConnectionEdge = {
  __typename?: 'OrganizationMembershipsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: OrganizationMembership;
};

export type OrganizationSearchHit = ISearchHit & {
  __typename?: 'OrganizationSearchHit';
  id: Scalars['ShortUuid']['output'];
  name: Scalars['String']['output'];
  organization: Organization;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type PrismaRuntimeError = {
  __typename?: 'PrismaRuntimeError';
  message: Scalars['String']['output'];
};

export type Query = {
  __typename?: 'Query';
  channelById: Channel;
  channelBySlug: Channel;
  channels: Array<ChannelEntry>;
  me?: Maybe<AppUser>;
  mySubscriptionUploadRecords?: Maybe<QueryMySubscriptionUploadRecordsConnection>;
  organizationById: Organization;
  search: SearchConnection;
  stats: Stats;
  uploadListById: UploadList;
  uploadRecordById: UploadRecord;
  uploadRecords: QueryUploadRecordsConnection;
  userById: AppUser;
  usersConnection: QueryUsersConnection;
};


export type QueryChannelByIdArgs = {
  id: Scalars['ShortUuid']['input'];
};


export type QueryChannelBySlugArgs = {
  slug: Scalars['String']['input'];
};


export type QueryMySubscriptionUploadRecordsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryOrganizationByIdArgs = {
  id: Scalars['ShortUuid']['input'];
};


export type QuerySearchArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  channels?: InputMaybe<Array<Scalars['String']['input']>>;
  first?: InputMaybe<Scalars['Int']['input']>;
  focus: SearchFocus;
  last?: InputMaybe<Scalars['Int']['input']>;
  maxPublishedAt?: InputMaybe<Scalars['DateTime']['input']>;
  minPublishedAt?: InputMaybe<Scalars['DateTime']['input']>;
  orderBy?: InputMaybe<SearchOrder>;
  query: Scalars['String']['input'];
  transcriptPhraseSearch?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryUploadListByIdArgs = {
  id: Scalars['ShortUuid']['input'];
};


export type QueryUploadRecordByIdArgs = {
  id: Scalars['ShortUuid']['input'];
};


export type QueryUploadRecordsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<UploadRecordsOrder>;
};


export type QueryUserByIdArgs = {
  id: Scalars['ShortUuid']['input'];
};


export type QueryUsersConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

export type QueryMySubscriptionUploadRecordsConnection = {
  __typename?: 'QueryMySubscriptionUploadRecordsConnection';
  edges: Array<QueryMySubscriptionUploadRecordsConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryMySubscriptionUploadRecordsConnectionEdge = {
  __typename?: 'QueryMySubscriptionUploadRecordsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: UploadRecord;
};

export type QueryUploadRecordsConnection = {
  __typename?: 'QueryUploadRecordsConnection';
  edges: Array<QueryUploadRecordsConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryUploadRecordsConnectionEdge = {
  __typename?: 'QueryUploadRecordsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: UploadRecord;
};

export type QueryUsersConnection = {
  __typename?: 'QueryUsersConnection';
  edges: Array<QueryUsersConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryUsersConnectionEdge = {
  __typename?: 'QueryUsersConnectionEdge';
  cursor: Scalars['String']['output'];
  node: AppUser;
};

export enum Rating {
  Dislike = 'DISLIKE',
  Like = 'LIKE'
}

export type ResizeParams = {
  height: Scalars['Int']['input'];
  width: Scalars['Int']['input'];
};

export type SearchAggs = {
  __typename?: 'SearchAggs';
  channelHitCount: Scalars['Int']['output'];
  channels: Array<SearchChannelAgg>;
  organizationHitCount: Scalars['Int']['output'];
  publishedAtRange?: Maybe<SearchPublishedAtAggData>;
  transcriptHitCount: Scalars['Int']['output'];
  uploadHitCount: Scalars['Int']['output'];
};

export type SearchChannelAgg = {
  __typename?: 'SearchChannelAgg';
  channel: Channel;
  count: Scalars['Int']['output'];
};

export type SearchConnection = {
  __typename?: 'SearchConnection';
  aggs: SearchAggs;
  edges: Array<SearchConnectionEdge>;
  pageInfo: PageInfo;
};

export type SearchConnectionEdge = {
  __typename?: 'SearchConnectionEdge';
  cursor: Scalars['String']['output'];
  node: ISearchHit;
};

export enum SearchFocus {
  Channels = 'CHANNELS',
  Organizations = 'ORGANIZATIONS',
  Transcripts = 'TRANSCRIPTS',
  Uploads = 'UPLOADS'
}

export enum SearchOrder {
  Avg = 'avg',
  Date = 'date',
  DateDesc = 'dateDesc',
  Sum = 'sum'
}

export type SearchPublishedAtAggData = {
  __typename?: 'SearchPublishedAtAggData';
  max: Scalars['DateTime']['output'];
  min: Scalars['DateTime']['output'];
};

export type Stats = {
  __typename?: 'Stats';
  totalUploadSeconds: Scalars['Float']['output'];
  totalUploads: Scalars['Int']['output'];
};

export type TimeRange = {
  end: Scalars['Float']['input'];
  start: Scalars['Float']['input'];
};

export type TranscriptLine = {
  __typename?: 'TranscriptLine';
  end: Scalars['Float']['output'];
  start: Scalars['Float']['output'];
  text: Scalars['String']['output'];
};

export type TranscriptSearchHit = ISearchHit & {
  __typename?: 'TranscriptSearchHit';
  hits: Array<TranscriptSearchInnerHit>;
  id: Scalars['ShortUuid']['output'];
  uploadRecord: UploadRecord;
};

export type TranscriptSearchInnerHit = {
  __typename?: 'TranscriptSearchInnerHit';
  end: Scalars['Int']['output'];
  start: Scalars['Int']['output'];
  text: HighlightedText;
};

export enum UploadLicense {
  Cc0 = 'CC0',
  CcBy = 'CC_BY',
  CcByNc = 'CC_BY_NC',
  CcByNcNd = 'CC_BY_NC_ND',
  CcByNcSa = 'CC_BY_NC_SA',
  CcByNd = 'CC_BY_ND',
  CcBySa = 'CC_BY_SA',
  PublicDomain = 'PUBLIC_DOMAIN',
  Standard = 'STANDARD'
}

export type UploadList = {
  __typename?: 'UploadList';
  author: AppUser;
  id: Scalars['ShortUuid']['output'];
  title: Scalars['String']['output'];
  type: UploadListType;
  uploads: UploadListUploadsConnection;
};


export type UploadListUploadsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

export type UploadListEntry = {
  __typename?: 'UploadListEntry';
  rank: Scalars['String']['output'];
  upload: UploadRecord;
  uploadList: UploadList;
};

export enum UploadListType {
  Playlist = 'PLAYLIST',
  Series = 'SERIES'
}

export type UploadListUploadsConnection = {
  __typename?: 'UploadListUploadsConnection';
  edges: Array<UploadListUploadsConnectionEdge>;
  pageInfo: PageInfo;
};

export type UploadListUploadsConnectionEdge = {
  __typename?: 'UploadListUploadsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: UploadListEntry;
};

export enum UploadOrderProperty {
  CreatedAt = 'createdAt',
  PublishedAt = 'publishedAt'
}

export enum UploadPostProcess {
  ChannelAvatar = 'channelAvatar',
  ChannelDefaultThumbnail = 'channelDefaultThumbnail',
  Media = 'media',
  ProfileAvatar = 'profileAvatar',
  Thumbnail = 'thumbnail'
}

export type UploadRecord = {
  __typename?: 'UploadRecord';
  audioSource?: Maybe<Scalars['String']['output']>;
  canMutate: Scalars['Boolean']['output'];
  channel: Channel;
  createdAt: Scalars['DateTime']['output'];
  createdBy: AppUser;
  description?: Maybe<Scalars['String']['output']>;
  downloadUrls?: Maybe<Array<MediaDownload>>;
  downloadsEnabled: Scalars['Boolean']['output'];
  id: Scalars['ShortUuid']['output'];
  lengthSeconds?: Maybe<Scalars['Float']['output']>;
  license: UploadLicense;
  mediaSource?: Maybe<Scalars['String']['output']>;
  myRating?: Maybe<Rating>;
  peaksDatUrl?: Maybe<Scalars['String']['output']>;
  peaksJsonUrl?: Maybe<Scalars['String']['output']>;
  playlists: UploadRecordPlaylistsConnection;
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  series: UploadRecordSeriesConnection;
  thumbnailBlurhash?: Maybe<Scalars['String']['output']>;
  thumbnailUrl?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  totalDislikes: Scalars['Int']['output'];
  totalLikes: Scalars['Int']['output'];
  totalViews: Scalars['Int']['output'];
  transcript?: Maybe<Array<TranscriptLine>>;
  updatedAt: Scalars['DateTime']['output'];
  uploadFinalized: Scalars['Boolean']['output'];
  uploadFinalizedBy: AppUser;
  uploadListById?: Maybe<UploadList>;
  uploadSizeBytes?: Maybe<Scalars['SafeInt']['output']>;
  userComments: UploadRecordUserCommentsConnection;
  userCommentsEnabled: Scalars['Boolean']['output'];
  variants: Array<UploadVariant>;
  visibility: UploadVisibility;
};


export type UploadRecordPlaylistsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type UploadRecordSeriesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type UploadRecordThumbnailUrlArgs = {
  resize?: InputMaybe<ResizeParams>;
};


export type UploadRecordUploadListByIdArgs = {
  id?: InputMaybe<Scalars['ShortUuid']['input']>;
};


export type UploadRecordUserCommentsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

export type UploadRecordPlaylistsConnection = {
  __typename?: 'UploadRecordPlaylistsConnection';
  edges: Array<UploadRecordPlaylistsConnectionEdge>;
  pageInfo: PageInfo;
};

export type UploadRecordPlaylistsConnectionEdge = {
  __typename?: 'UploadRecordPlaylistsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: UploadList;
};

export type UploadRecordSeriesConnection = {
  __typename?: 'UploadRecordSeriesConnection';
  edges: Array<UploadRecordSeriesConnectionEdge>;
  pageInfo: PageInfo;
};

export type UploadRecordSeriesConnectionEdge = {
  __typename?: 'UploadRecordSeriesConnectionEdge';
  cursor: Scalars['String']['output'];
  node: UploadList;
};

export type UploadRecordUserCommentsConnection = {
  __typename?: 'UploadRecordUserCommentsConnection';
  edges: Array<UploadRecordUserCommentsConnectionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type UploadRecordUserCommentsConnectionEdge = {
  __typename?: 'UploadRecordUserCommentsConnectionEdge';
  cursor: Scalars['String']['output'];
  node: UploadUserComment;
};

export enum UploadRecordsOrder {
  Latest = 'latest',
  Trending = 'trending'
}

export type UploadSearchHit = ISearchHit & {
  __typename?: 'UploadSearchHit';
  id: Scalars['ShortUuid']['output'];
  title: Scalars['String']['output'];
  uploadRecord: UploadRecord;
};

export type UploadUserComment = {
  __typename?: 'UploadUserComment';
  author: AppUser;
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ShortUuid']['output'];
  myRating?: Maybe<Rating>;
  replies: UploadUserCommentRepliesConnection;
  replyingTo: UploadUserComment;
  text: Scalars['String']['output'];
  totalDislikes: Scalars['Int']['output'];
  totalLikes: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
  upload: UploadRecord;
  uploadRecordId: Scalars['ShortUuid']['output'];
};


export type UploadUserCommentRepliesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

export type UploadUserCommentRepliesConnection = {
  __typename?: 'UploadUserCommentRepliesConnection';
  edges: Array<UploadUserCommentRepliesConnectionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type UploadUserCommentRepliesConnectionEdge = {
  __typename?: 'UploadUserCommentRepliesConnectionEdge';
  cursor: Scalars['String']['output'];
  node: UploadUserComment;
};

export enum UploadVariant {
  Audio = 'AUDIO',
  AudioDownload = 'AUDIO_DOWNLOAD',
  Video_4K = 'VIDEO_4K',
  Video_4KDownload = 'VIDEO_4K_DOWNLOAD',
  Video_360P = 'VIDEO_360P',
  Video_360PDownload = 'VIDEO_360P_DOWNLOAD',
  Video_480P = 'VIDEO_480P',
  Video_480PDownload = 'VIDEO_480P_DOWNLOAD',
  Video_720P = 'VIDEO_720P',
  Video_720PDownload = 'VIDEO_720P_DOWNLOAD',
  Video_1080P = 'VIDEO_1080P',
  Video_1080PDownload = 'VIDEO_1080P_DOWNLOAD'
}

export enum UploadVisibility {
  Private = 'PRIVATE',
  Public = 'PUBLIC',
  Unlisted = 'UNLISTED'
}

export type ValidationError = {
  __typename?: 'ValidationError';
  fieldErrors: Array<ZodFieldError>;
};

export type ZodFieldError = {
  __typename?: 'ZodFieldError';
  message: Scalars['String']['output'];
  path: Array<Scalars['String']['output']>;
};
