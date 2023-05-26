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
  Jwt: string;
  SafeInt: number;
  ShortUuid: string;
  Uuid: string;
};

export type AppUser = {
  __typename?: 'AppUser';
  avatarUrl?: Maybe<Scalars['String']>;
  canUpload: Scalars['Boolean'];
  channelMembershipsConnection: AppUserChannelMembershipsConnection;
  channelSubscriptionsConnection: AppUserChannelSubscriptionsConnection;
  createdAt: Scalars['DateTime'];
  emails: Array<AppUserEmail>;
  fullName?: Maybe<Scalars['String']>;
  id: Scalars['ShortUuid'];
  organizationMemberhipsConnection: AppUserOrganizationMemberhipsConnection;
  role: AppUserRole;
  updatedAt: Scalars['DateTime'];
  username: Scalars['String'];
};


export type AppUserChannelMembershipsConnectionArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  canUpload?: InputMaybe<Scalars['Boolean']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type AppUserChannelSubscriptionsConnectionArgs = {
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
  edges: Array<AppUserChannelMembershipsConnectionEdge>;
  pageInfo: PageInfo;
};

export type AppUserChannelMembershipsConnectionEdge = {
  __typename?: 'AppUserChannelMembershipsConnectionEdge';
  cursor: Scalars['String'];
  node: ChannelMembership;
};

export type AppUserChannelSubscriptionsConnection = {
  __typename?: 'AppUserChannelSubscriptionsConnection';
  edges: Array<AppUserChannelSubscriptionsConnectionEdge>;
  pageInfo: PageInfo;
};

export type AppUserChannelSubscriptionsConnectionEdge = {
  __typename?: 'AppUserChannelSubscriptionsConnectionEdge';
  cursor: Scalars['String'];
  node: ChannelSubscription;
};

export type AppUserEmail = {
  __typename?: 'AppUserEmail';
  email: Scalars['String'];
  id: Scalars['ShortUuid'];
  verifiedAt?: Maybe<Scalars['DateTime']>;
};

export type AppUserOrganizationMemberhipsConnection = {
  __typename?: 'AppUserOrganizationMemberhipsConnection';
  edges: Array<AppUserOrganizationMemberhipsConnectionEdge>;
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
  avatarUrl?: Maybe<Scalars['String']>;
  createdAt: Scalars['DateTime'];
  description?: Maybe<Scalars['String']>;
  id: Scalars['ShortUuid'];
  membershipsConnection: ChannelMembershipsConnection;
  name: Scalars['String'];
  slug: Scalars['String'];
  subscribersConnection: ChannelSubscribersConnection;
  updatedAt: Scalars['DateTime'];
  uploadsConnection: ChannelUploadsConnection;
  userIsSubscribed: Scalars['Boolean'];
};


export type ChannelMembershipsConnectionArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type ChannelSubscribersConnectionArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type ChannelUploadsConnectionArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  includeUnlisted?: InputMaybe<Scalars['Boolean']>;
  last?: InputMaybe<Scalars['Int']>;
  order?: InputMaybe<Order>;
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
  edges: Array<ChannelMembershipsConnectionEdge>;
  pageInfo: PageInfo;
};

export type ChannelMembershipsConnectionEdge = {
  __typename?: 'ChannelMembershipsConnectionEdge';
  cursor: Scalars['String'];
  node: ChannelMembership;
};

export type ChannelSearchHit = ISearchHit & {
  __typename?: 'ChannelSearchHit';
  channel: Channel;
  id: Scalars['ShortUuid'];
  name: Scalars['String'];
};

export type ChannelSubscribersConnection = {
  __typename?: 'ChannelSubscribersConnection';
  edges: Array<ChannelSubscribersConnectionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int'];
};

export type ChannelSubscribersConnectionEdge = {
  __typename?: 'ChannelSubscribersConnectionEdge';
  cursor: Scalars['String'];
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
  totalCount: Scalars['Int'];
};

export type ChannelUploadsConnectionEdge = {
  __typename?: 'ChannelUploadsConnectionEdge';
  cursor: Scalars['String'];
  node: UploadRecord;
};

export type DataError = {
  __typename?: 'DataError';
  error: PrismaRuntimeError;
};

export type HighlightedText = {
  __typename?: 'HighlightedText';
  marked: Scalars['String'];
  source: Scalars['String'];
};

export type ISearchHit = {
  id: Scalars['ShortUuid'];
};

export type MediaDownload = {
  __typename?: 'MediaDownload';
  kind: MediaDownloadKind;
  label: Scalars['String'];
  url: Scalars['String'];
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
  partSize: Scalars['Int'];
  s3UploadId: Scalars['String'];
  s3UploadKey: Scalars['String'];
  urls: Array<Scalars['String']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  createChannel: Channel;
  createMultipartUpload: MultipartUploadMeta;
  createOrganization: Organization;
  finalizeMultipartUpload: Scalars['Boolean'];
  login?: Maybe<Scalars['Jwt']>;
  logout: Scalars['Boolean'];
  rateComment: Scalars['Boolean'];
  rateUpload: Scalars['Boolean'];
  recordUploadView: Scalars['Boolean'];
  register: MutationRegisterResult;
  subscribeToChannel: ChannelSubscription;
  unsubscribeFromChannel: Scalars['Boolean'];
  updateChannel: Channel;
  updateUser: AppUser;
  upsertChannelMembership: ChannelMembership;
  upsertOrganizationMembership: OrganizationMembership;
  upsertUploadRecord: UploadRecord;
  upsertUploadUserComment: UploadUserComment;
  verifyEmail: Scalars['Boolean'];
};


export type MutationCreateChannelArgs = {
  name: Scalars['String'];
  slug?: InputMaybe<Scalars['String']>;
};


export type MutationCreateMultipartUploadArgs = {
  bytes: Scalars['SafeInt'];
  postProcess: UploadPostProcess;
  targetId: Scalars['ShortUuid'];
  uploadMimeType: Scalars['String'];
};


export type MutationCreateOrganizationArgs = {
  name: Scalars['String'];
  slug?: InputMaybe<Scalars['String']>;
};


export type MutationFinalizeMultipartUploadArgs = {
  s3PartETags: Array<Scalars['String']>;
  s3UploadId: Scalars['String'];
  s3UploadKey: Scalars['String'];
  targetId: Scalars['ShortUuid'];
};


export type MutationLoginArgs = {
  id: Scalars['String'];
  password: Scalars['String'];
};


export type MutationRateCommentArgs = {
  rating: Rating;
  uploadUserCommentId: Scalars['ShortUuid'];
};


export type MutationRateUploadArgs = {
  rating: Rating;
  uploadRecordId: Scalars['ShortUuid'];
};


export type MutationRecordUploadViewArgs = {
  uploadRecordId: Scalars['ShortUuid'];
};


export type MutationRegisterArgs = {
  agreeToTerms: Scalars['Boolean'];
  agreeToTheology: Scalars['Boolean'];
  email: Scalars['String'];
  fullName?: InputMaybe<Scalars['String']>;
  password: Scalars['String'];
  username: Scalars['String'];
};


export type MutationSubscribeToChannelArgs = {
  channelId: Scalars['ShortUuid'];
};


export type MutationUnsubscribeFromChannelArgs = {
  channelId: Scalars['ShortUuid'];
};


export type MutationUpdateChannelArgs = {
  channelId: Scalars['ShortUuid'];
  name: Scalars['String'];
};


export type MutationUpdateUserArgs = {
  email: Scalars['String'];
  fullName: Scalars['String'];
  userId: Scalars['ShortUuid'];
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


export type MutationUpsertUploadRecordArgs = {
  channelId: Scalars['ShortUuid'];
  description?: InputMaybe<Scalars['String']>;
  downloadsEnabled?: InputMaybe<Scalars['Boolean']>;
  license: UploadLicense;
  publishedAt: Scalars['DateTime'];
  title?: InputMaybe<Scalars['String']>;
  uploadRecordId?: InputMaybe<Scalars['ShortUuid']>;
  userCommentsEnabled?: InputMaybe<Scalars['Boolean']>;
  visibility: UploadVisibility;
};


export type MutationUpsertUploadUserCommentArgs = {
  commentId?: InputMaybe<Scalars['ShortUuid']>;
  replyingTo?: InputMaybe<Scalars['ShortUuid']>;
  text: Scalars['String'];
  uploadRecordId: Scalars['ShortUuid'];
};


export type MutationVerifyEmailArgs = {
  emailId: Scalars['ShortUuid'];
  emailKey: Scalars['ShortUuid'];
  userId: Scalars['ShortUuid'];
};

export type MutationRegisterResult = DataError | MutationRegisterSuccess | ValidationError;

export type MutationRegisterSuccess = {
  __typename?: 'MutationRegisterSuccess';
  data: AppUser;
};

export enum Order {
  Asc = 'asc',
  Desc = 'desc'
}

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
  edges: Array<OrganizationAssociationsConnectionEdge>;
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
  edges: Array<OrganizationMembershipsConnectionEdge>;
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
  name: Scalars['String'];
  organization: Organization;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']>;
  hasNextPage: Scalars['Boolean'];
  hasPreviousPage: Scalars['Boolean'];
  startCursor?: Maybe<Scalars['String']>;
};

export type PrismaRuntimeError = {
  __typename?: 'PrismaRuntimeError';
  message: Scalars['String'];
};

export type Query = {
  __typename?: 'Query';
  channelById: Channel;
  me?: Maybe<AppUser>;
  mySubscriptionUploadRecords?: Maybe<QueryMySubscriptionUploadRecordsConnection>;
  organizationById: Organization;
  search: SearchConnection;
  uploadRecordById: UploadRecord;
  uploadRecords: QueryUploadRecordsConnection;
  userById: AppUser;
  usersConnection: QueryUsersConnection;
};


export type QueryChannelByIdArgs = {
  id: Scalars['ShortUuid'];
};


export type QueryMySubscriptionUploadRecordsArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type QueryOrganizationByIdArgs = {
  id: Scalars['ShortUuid'];
};


export type QuerySearchArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  channels?: InputMaybe<Array<Scalars['ShortUuid']>>;
  first?: InputMaybe<Scalars['Int']>;
  focus: SearchFocus;
  last?: InputMaybe<Scalars['Int']>;
  maxPublishedAt?: InputMaybe<Scalars['DateTime']>;
  minPublishedAt?: InputMaybe<Scalars['DateTime']>;
  query: Scalars['String'];
  transcriptPhraseSearch?: InputMaybe<Scalars['Boolean']>;
};


export type QueryUploadRecordByIdArgs = {
  id: Scalars['ShortUuid'];
};


export type QueryUploadRecordsArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
  orderBy?: InputMaybe<UploadRecordsOrder>;
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

export type QueryMySubscriptionUploadRecordsConnection = {
  __typename?: 'QueryMySubscriptionUploadRecordsConnection';
  edges: Array<QueryMySubscriptionUploadRecordsConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryMySubscriptionUploadRecordsConnectionEdge = {
  __typename?: 'QueryMySubscriptionUploadRecordsConnectionEdge';
  cursor: Scalars['String'];
  node: UploadRecord;
};

export type QueryUploadRecordsConnection = {
  __typename?: 'QueryUploadRecordsConnection';
  edges: Array<QueryUploadRecordsConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryUploadRecordsConnectionEdge = {
  __typename?: 'QueryUploadRecordsConnectionEdge';
  cursor: Scalars['String'];
  node: UploadRecord;
};

export type QueryUsersConnection = {
  __typename?: 'QueryUsersConnection';
  edges: Array<QueryUsersConnectionEdge>;
  pageInfo: PageInfo;
};

export type QueryUsersConnectionEdge = {
  __typename?: 'QueryUsersConnectionEdge';
  cursor: Scalars['String'];
  node: AppUser;
};

export enum Rating {
  Dislike = 'DISLIKE',
  Like = 'LIKE'
}

export type SearchAggs = {
  __typename?: 'SearchAggs';
  channelHitCount: Scalars['Int'];
  channels: Array<SearchChannelAgg>;
  organizationHitCount: Scalars['Int'];
  publishedAtRange?: Maybe<SearchPublishedAtAggData>;
  transcriptHitCount: Scalars['Int'];
  uploadHitCount: Scalars['Int'];
};

export type SearchChannelAgg = {
  __typename?: 'SearchChannelAgg';
  channel: Channel;
  count: Scalars['Int'];
};

export type SearchConnection = {
  __typename?: 'SearchConnection';
  aggs: SearchAggs;
  edges: Array<SearchConnectionEdge>;
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
  Transcripts = 'TRANSCRIPTS',
  Uploads = 'UPLOADS'
}

export type SearchPublishedAtAggData = {
  __typename?: 'SearchPublishedAtAggData';
  max: Scalars['DateTime'];
  min: Scalars['DateTime'];
};

export type TranscriptLine = {
  __typename?: 'TranscriptLine';
  end: Scalars['Float'];
  start: Scalars['Float'];
  text: Scalars['String'];
};

export type TranscriptSearchHit = ISearchHit & {
  __typename?: 'TranscriptSearchHit';
  hits: Array<TranscriptSearchInnerHit>;
  id: Scalars['ShortUuid'];
  uploadRecord: UploadRecord;
};

export type TranscriptSearchInnerHit = {
  __typename?: 'TranscriptSearchInnerHit';
  end: Scalars['Int'];
  start: Scalars['Int'];
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

export enum UploadPostProcess {
  ChannelAvatar = 'channelAvatar',
  Media = 'media',
  ProfileAvatar = 'profileAvatar',
  Thumbnail = 'thumbnail'
}

export type UploadRecord = {
  __typename?: 'UploadRecord';
  audioSource?: Maybe<Scalars['String']>;
  canMutate: Scalars['Boolean'];
  channel: Channel;
  createdAt: Scalars['DateTime'];
  createdBy: AppUser;
  description?: Maybe<Scalars['String']>;
  downloadUrls?: Maybe<Array<MediaDownload>>;
  downloadsEnabled: Scalars['Boolean'];
  id: Scalars['ShortUuid'];
  license: UploadLicense;
  mediaSource?: Maybe<Scalars['String']>;
  myRating?: Maybe<Rating>;
  publishedAt?: Maybe<Scalars['DateTime']>;
  thumbnailBlurhash?: Maybe<Scalars['String']>;
  thumbnailUrl?: Maybe<Scalars['String']>;
  title?: Maybe<Scalars['String']>;
  totalDislikes: Scalars['Int'];
  totalLikes: Scalars['Int'];
  totalViews: Scalars['Int'];
  transcript?: Maybe<Array<TranscriptLine>>;
  updatedAt: Scalars['DateTime'];
  uploadFinalized: Scalars['Boolean'];
  uploadFinalizedBy: AppUser;
  uploadSizeBytes?: Maybe<Scalars['SafeInt']>;
  userComments: UploadRecordUserCommentsConnection;
  userCommentsEnabled: Scalars['Boolean'];
  variants: Array<UploadVariant>;
  visibility: UploadVisibility;
};


export type UploadRecordUserCommentsArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};

export type UploadRecordUserCommentsConnection = {
  __typename?: 'UploadRecordUserCommentsConnection';
  edges: Array<UploadRecordUserCommentsConnectionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int'];
};

export type UploadRecordUserCommentsConnectionEdge = {
  __typename?: 'UploadRecordUserCommentsConnectionEdge';
  cursor: Scalars['String'];
  node: UploadUserComment;
};

export enum UploadRecordsOrder {
  Latest = 'latest',
  Trending = 'trending'
}

export type UploadSearchHit = ISearchHit & {
  __typename?: 'UploadSearchHit';
  id: Scalars['ShortUuid'];
  title: Scalars['String'];
  uploadRecord: UploadRecord;
};

export type UploadUserComment = {
  __typename?: 'UploadUserComment';
  author: AppUser;
  createdAt: Scalars['DateTime'];
  id: Scalars['ShortUuid'];
  myRating?: Maybe<Rating>;
  replies: UploadUserCommentRepliesConnection;
  replyingTo: UploadUserComment;
  text: Scalars['String'];
  totalDislikes: Scalars['Int'];
  totalLikes: Scalars['Int'];
  updatedAt: Scalars['DateTime'];
  upload: UploadRecord;
  uploadRecordId: Scalars['ShortUuid'];
};


export type UploadUserCommentRepliesArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};

export type UploadUserCommentRepliesConnection = {
  __typename?: 'UploadUserCommentRepliesConnection';
  edges: Array<UploadUserCommentRepliesConnectionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int'];
};

export type UploadUserCommentRepliesConnectionEdge = {
  __typename?: 'UploadUserCommentRepliesConnectionEdge';
  cursor: Scalars['String'];
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
  message: Scalars['String'];
  path: Array<Scalars['String']>;
};
