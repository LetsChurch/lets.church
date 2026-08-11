import { relations, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  boolean,
  check,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// PostgreSQL citext preserves string values while applying case-insensitive
// comparison semantics to equality, indexes, and constraints.
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const AppUserRole = pgEnum('app_user_role', ['USER', 'ADMIN']);

export const AppAuthTokenType = pgEnum('app_auth_token_type', [
  'EMAIL_SIGN_IN',
  'PASSWORD_RESET',
]);

export const DonationFrequency = pgEnum('donation_frequency', [
  'ONE_TIME',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
]);

export const DonationCheckoutStatus = pgEnum('donation_checkout_status', [
  'OPEN',
  'COMPLETED',
  'EXPIRED',
]);

export const DonationStatus = pgEnum('donation_status', [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'DISPUTED',
]);

export const DonationSource = pgEnum('donation_source', ['STRIPE', 'IMPORT']);

export const DonationSubscriptionStatus = pgEnum(
  'donation_subscription_status',
  [
    'INCOMPLETE',
    'INCOMPLETE_EXPIRED',
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELED',
    'UNPAID',
    'PAUSED',
  ],
);

export const DonationImportType = pgEnum('donation_import_type', [
  'TRANSACTION_HISTORY',
  'RECURRING_PLANS',
]);

export const DonationImportStatus = pgEnum('donation_import_status', [
  'VALIDATED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
]);

export const TagColor = pgEnum('TagColor', [
  'GRAY',
  'RED',
  'YELLOW',
  'GREEN',
  'BLUE',
  'INDIGO',
  'PURPLE',
  'PINK',
]);

export const OrganizationType = pgEnum('organization_type', [
  'CHURCH',
  'MINISTRY',
]);

export const InvitationStatus = pgEnum('invitation_status', [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CANCELLED',
]);

// Kinds of automatic + future-user annotations on transcript_paragraph rows.
// Today only the three automatic kinds; user/author kinds (USER_PRIVATE,
// AUTHOR_PUBLIC) will be added via ALTER TYPE when those code paths ship.
export const AnnotationKind = pgEnum('annotation_kind', [
  'OUTLINE',
  'BIBLE',
  'KEYWORD',
]);

export const OrganizationTagCategory = pgEnum('organization_tag_category', [
  'DENOMINATION',
  'DOCTRINE',
  'ESCHATOLOGY',
  'WORSHIP',
  'CONFESSION',
  'GOVERNMENT',
  'OTHER',
]);

export const AddressType = pgEnum('address_type', [
  'MAILING',
  'MEETING',
  'OFFICE',
  'OTHER',
]);

export const OrganizationLeaderType = pgEnum('organization_leader_type', [
  'ELDER',
  'DEACON',
  'OTHER',
]);

export const ChannelVisibility = pgEnum('channel_visibility', [
  'PUBLIC',
  'PRIVATE',
  'UNLISTED',
]);

export const UploadLicense = pgEnum('upload_license', [
  'STANDARD',
  'PUBLIC_DOMAIN',
  'CC_BY',
  'CC_BY_SA',
  'CC_BY_NC',
  'CC_BY_NC_SA',
  'CC_BY_ND',
  'CC_BY_NC_ND',
  'CC0',
]);

export const UploadVisibility = pgEnum('upload_visibility', [
  'PUBLIC',
  'PRIVATE',
  'UNLISTED',
]);

export const UploadVariant = pgEnum('upload_variant', [
  'VIDEO_4K',
  'VIDEO_4K_DOWNLOAD',
  'VIDEO_1080P',
  'VIDEO_1080P_DOWNLOAD',
  'VIDEO_720P',
  'VIDEO_720P_DOWNLOAD',
  'VIDEO_480P',
  'VIDEO_480P_DOWNLOAD',
  'VIDEO_360P',
  'VIDEO_360P_DOWNLOAD',
  'AUDIO',
  'AUDIO_DOWNLOAD',
]);

// Which ffmpeg encoder the most recent transcode used: libx264 (software)
// or h264_ama (AMD MA35 hardware). Named after the actual `-c:v` encoders
// so it extends cleanly if other encoders are added.
export const TranscodeEncoder = pgEnum('transcode_encoder', [
  'libx264',
  'h264_ama',
]);

export const UploadStateType = pgEnum('upload_state_type', [
  'MEDIA',
  'THUMBNAIL',
  'PROFILE_AVATAR',
  'CHANNEL_AVATAR',
  'CHANNEL_COVER',
  'ORGANIZATION_AVATAR',
  'ORGANIZATION_COVER',
  'CHANNEL_DEFAULT_THUMBNAIL',
]);

export const BackupStatus = pgEnum('backup_status', [
  'NOT_BACKED_UP',
  'BACKING_UP',
  'BACKED_UP',
  'BACKUP_FAILED',
]);

export const StorageAuditStatus = pgEnum('storage_audit_status', [
  'RUNNING',
  'COMPLETED',
  'FAILED',
]);

export const Rating = pgEnum('rating', ['LIKE', 'DISLIKE']);

export const UploadViewSource = pgEnum('upload_view_source', [
  'WEBSITE',
  'EMBED',
]);

export const UploadListType = pgEnum('upload_list_type', [
  'SERIES',
  'PLAYLIST',
]);

export const UploadListVisibility = pgEnum('upload_list_visibility', [
  'PUBLIC',
  'UNLISTED',
]);

export const NewsletterListType = pgEnum('newsletter_list_type', [
  'public',
  'private',
]);

export const NewsletterListOptin = pgEnum('newsletter_list_optin', [
  'single',
  'double',
]);

export const ChannelImportSourceWorkflowStatus = pgEnum(
  'channel_import_source_workflow_status',
  ['NOT_STARTED', 'RUNNING', 'PAUSED', 'FAILED'],
);

export const ChannelImportRunStatus = pgEnum('channel_import_run_status', [
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'PARTIAL',
]);

export const TrackingSalt = pgTable('tracking_salt', {
  id: serial('id').notNull().primaryKey(),
  salt: integer('salt').notNull(),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
});

export const AppUser = pgTable('app_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: citext('username').notNull().unique(),
  password: text('password'),
  fullName: varchar('full_name', { length: 100 }),
  avatarPath: varchar('avatar_path', { length: 255 }),
  avatarBlurhash: varchar('avatar_blurhash', { length: 255 }),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 })
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { precision: 3 }),
  role: AppUserRole('role').notNull().default('USER'),
  bannedAt: timestamp('banned_at', { precision: 3 }),
  banReason: text('ban_reason'),
  bannedById: uuid('banned_by_id').references((): AnyPgColumn => AppUser.id),
  statementOfTheologyAcceptedAt: timestamp(
    'statement_of_theology_accepted_at',
    { precision: 3 },
  ),
  termsAcceptedAt: timestamp('terms_accepted_at', { precision: 3 }),
});

export const AppUserEmail = pgTable(
  'app_user_email',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appUserId: uuid('app_user_id').notNull(),
    email: citext('email').notNull().unique(),
    key: uuid('key').notNull().defaultRandom(),
    verifiedAt: timestamp('verified_at', { precision: 3 }),
  },
  (AppUserEmail) => ({
    app_user_email_appUser_fkey: foreignKey({
      name: 'app_user_email_appUser_fkey',
      columns: [AppUserEmail.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const AppSession = pgTable(
  'app_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appUserId: uuid('app_user_id').notNull(),
    expiresAt: timestamp('expires_at', { precision: 3 })
      .notNull()
      .default(sql`(now() + '30 days'::interval)`),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { precision: 3 }),
  },
  (AppSession) => ({
    app_session_appUser_fkey: foreignKey({
      name: 'app_session_appUser_fkey',
      columns: [AppSession.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const AppAuthToken = pgTable(
  'app_auth_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: AppAuthTokenType('type').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    email: citext('email').notNull(),
    appUserId: uuid('app_user_id'),
    returnTo: text('return_to'),
    expiresAt: timestamp('expires_at', { precision: 3 }).notNull(),
    consumedAt: timestamp('consumed_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (AppAuthToken) => ({
    app_auth_token_appUser_fkey: foreignKey({
      name: 'app_auth_token_appUser_fkey',
      columns: [AppAuthToken.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    app_auth_token_email_createdAt_idx: index(
      'app_auth_token_email_createdAt_idx',
    ).on(AppAuthToken.email, AppAuthToken.createdAt),
    app_auth_token_expiresAt_idx: index('app_auth_token_expiresAt_idx').on(
      AppAuthToken.expiresAt,
    ),
  }),
);

export const DonationDonor = pgTable(
  'donation_donor',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appUserId: uuid('app_user_id'),
    // Checkout and account-linking paths normalize emails to lowercase before
    // insert. NULL supports historical offline gifts that have no email.
    email: citext('email').unique(),
    name: text('name'),
    stripeCustomerId: text('stripe_customer_id').unique(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (DonationDonor) => ({
    donation_donor_appUser_fkey: foreignKey({
      name: 'donation_donor_appUser_fkey',
      columns: [DonationDonor.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    donation_donor_appUserId_idx: index('donation_donor_appUserId_idx').on(
      DonationDonor.appUserId,
    ),
  }),
);

export const DonationImportBatch = pgTable(
  'donation_import_batch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: DonationImportType('type').notNull(),
    status: DonationImportStatus('status').notNull(),
    filename: text('filename').notNull(),
    rowCount: integer('row_count').notNull().default(0),
    readyCount: integer('ready_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    importedCount: integer('imported_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    error: text('error'),
    summary: jsonb('summary')
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdById: uuid('created_by_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
    completedAt: timestamp('completed_at', { precision: 3 }),
  },
  (DonationImportBatch) => ({
    donation_import_batch_createdBy_fkey: foreignKey({
      name: 'donation_import_batch_createdBy_fkey',
      columns: [DonationImportBatch.createdById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    donation_import_batch_createdAt_idx: index(
      'donation_import_batch_createdAt_idx',
    ).on(DonationImportBatch.createdAt),
    donation_import_batch_counts_nonnegative: check(
      'donation_import_batch_counts_nonnegative',
      sql`${DonationImportBatch.rowCount} >= 0
        and ${DonationImportBatch.readyCount} >= 0
        and ${DonationImportBatch.skippedCount} >= 0
        and ${DonationImportBatch.importedCount} >= 0
        and ${DonationImportBatch.duplicateCount} >= 0`,
    ),
  }),
);

export const DonationCheckout = pgTable(
  'donation_checkout',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    donorId: uuid('donor_id').notNull(),
    stripeCheckoutSessionId: text('stripe_checkout_session_id').unique(),
    frequency: DonationFrequency('frequency').notNull(),
    baseAmountCents: integer('base_amount_cents').notNull(),
    feeCoverageCents: integer('fee_coverage_cents').notNull().default(0),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('usd'),
    status: DonationCheckoutStatus('status').notNull().default('OPEN'),
    expiresAt: timestamp('expires_at', { precision: 3 }),
    completedAt: timestamp('completed_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (DonationCheckout) => ({
    donation_checkout_donor_fkey: foreignKey({
      name: 'donation_checkout_donor_fkey',
      columns: [DonationCheckout.donorId],
      foreignColumns: [DonationDonor.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    donation_checkout_donorId_idx: index('donation_checkout_donorId_idx').on(
      DonationCheckout.donorId,
    ),
    donation_checkout_amount_positive: check(
      'donation_checkout_amount_positive',
      sql`${DonationCheckout.amountCents} > 0`,
    ),
    donation_checkout_amounts_consistent: check(
      'donation_checkout_amounts_consistent',
      sql`${DonationCheckout.baseAmountCents} > 0
        and ${DonationCheckout.feeCoverageCents} >= 0
        and ${DonationCheckout.amountCents} = ${DonationCheckout.baseAmountCents} + ${DonationCheckout.feeCoverageCents}`,
    ),
  }),
);

export const DonationSubscription = pgTable(
  'donation_subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    donorId: uuid('donor_id').notNull(),
    checkoutId: uuid('checkout_id').unique(),
    legacyExternalId: text('legacy_external_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    stripePriceId: text('stripe_price_id'),
    frequency: DonationFrequency('frequency').notNull().default('MONTHLY'),
    status: DonationSubscriptionStatus('status').notNull(),
    baseAmountCents: integer('base_amount_cents').notNull(),
    feeCoverageCents: integer('fee_coverage_cents').notNull().default(0),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('usd'),
    currentPeriodStart: timestamp('current_period_start', { precision: 3 }),
    currentPeriodEnd: timestamp('current_period_end', { precision: 3 }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: timestamp('canceled_at', { precision: 3 }),
    endedAt: timestamp('ended_at', { precision: 3 }),
    lastPaymentFailedAt: timestamp('last_payment_failed_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (DonationSubscription) => ({
    donation_subscription_donor_fkey: foreignKey({
      name: 'donation_subscription_donor_fkey',
      columns: [DonationSubscription.donorId],
      foreignColumns: [DonationDonor.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    donation_subscription_checkout_fkey: foreignKey({
      name: 'donation_subscription_checkout_fkey',
      columns: [DonationSubscription.checkoutId],
      foreignColumns: [DonationCheckout.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    donation_subscription_donorId_idx: index(
      'donation_subscription_donorId_idx',
    ).on(DonationSubscription.donorId),
    donation_subscription_recurring_frequency: check(
      'donation_subscription_recurring_frequency',
      sql`${DonationSubscription.frequency} <> 'ONE_TIME'`,
    ),
    donation_subscription_amounts_consistent: check(
      'donation_subscription_amounts_consistent',
      sql`${DonationSubscription.baseAmountCents} > 0
        and ${DonationSubscription.feeCoverageCents} >= 0
        and ${DonationSubscription.amountCents} = ${DonationSubscription.baseAmountCents} + ${DonationSubscription.feeCoverageCents}`,
    ),
  }),
);

export const Donation = pgTable(
  'donation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    donorId: uuid('donor_id').notNull(),
    checkoutId: uuid('checkout_id'),
    subscriptionId: uuid('subscription_id'),
    source: DonationSource('source').notNull(),
    externalId: text('external_id').notNull().unique(),
    frequency: DonationFrequency('frequency').notNull(),
    status: DonationStatus('status').notNull(),
    baseAmountCents: integer('base_amount_cents').notNull(),
    feeCoverageCents: integer('fee_coverage_cents').notNull().default(0),
    amountCents: integer('amount_cents').notNull(),
    processingFeeCents: integer('processing_fee_cents'),
    netAmountCents: integer('net_amount_cents'),
    refundedAmountCents: integer('refunded_amount_cents').notNull().default(0),
    currency: text('currency').notNull().default('usd'),
    stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
    stripeChargeId: text('stripe_charge_id').unique(),
    stripeInvoiceId: text('stripe_invoice_id').unique(),
    receiptUrl: text('receipt_url'),
    disputeStatus: text('dispute_status'),
    donatedAt: timestamp('donated_at', { precision: 3 }).notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (Donation) => ({
    donation_donor_fkey: foreignKey({
      name: 'donation_donor_fkey',
      columns: [Donation.donorId],
      foreignColumns: [DonationDonor.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    donation_checkout_fkey: foreignKey({
      name: 'donation_checkout_fkey',
      columns: [Donation.checkoutId],
      foreignColumns: [DonationCheckout.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    donation_subscription_fkey: foreignKey({
      name: 'donation_subscription_fkey',
      columns: [Donation.subscriptionId],
      foreignColumns: [DonationSubscription.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    donation_donorId_donatedAt_idx: index('donation_donorId_donatedAt_idx').on(
      Donation.donorId,
      Donation.donatedAt,
    ),
    donation_status_donatedAt_idx: index('donation_status_donatedAt_idx').on(
      Donation.status,
      Donation.donatedAt,
    ),
    donation_amount_positive: check(
      'donation_amount_positive',
      sql`${Donation.amountCents} > 0`,
    ),
    donation_amounts_consistent: check(
      'donation_amounts_consistent',
      sql`${Donation.baseAmountCents} > 0
        and ${Donation.feeCoverageCents} >= 0
        and ${Donation.amountCents} = ${Donation.baseAmountCents} + ${Donation.feeCoverageCents}
        and ${Donation.refundedAmountCents} >= 0
        and ${Donation.refundedAmountCents} <= ${Donation.amountCents}`,
    ),
    donation_fees_nonnegative: check(
      'donation_fees_nonnegative',
      sql`(${Donation.processingFeeCents} is null or ${Donation.processingFeeCents} >= 0)
        and (${Donation.netAmountCents} is null or ${Donation.netAmountCents} >= 0)`,
    ),
  }),
);

export const DonationPaymentAdjustment = pgTable(
  'donation_payment_adjustment',
  {
    stripeChargeId: text('stripe_charge_id').primaryKey(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    chargeAmountCents: integer('charge_amount_cents'),
    refundedAmountCents: integer('refunded_amount_cents'),
    disputeStatus: text('dispute_status'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (DonationPaymentAdjustment) => ({
    donation_payment_adjustment_paymentIntent_idx: index(
      'donation_payment_adjustment_paymentIntent_idx',
    ).on(DonationPaymentAdjustment.stripePaymentIntentId),
    donation_payment_adjustment_amounts_valid: check(
      'donation_payment_adjustment_amounts_valid',
      sql`(${DonationPaymentAdjustment.chargeAmountCents} is null or ${DonationPaymentAdjustment.chargeAmountCents} > 0)
        and (${DonationPaymentAdjustment.refundedAmountCents} is null or ${DonationPaymentAdjustment.refundedAmountCents} >= 0)
        and (${DonationPaymentAdjustment.chargeAmountCents} is null
          or ${DonationPaymentAdjustment.refundedAmountCents} is null
          or ${DonationPaymentAdjustment.refundedAmountCents} <= ${DonationPaymentAdjustment.chargeAmountCents})`,
    ),
  }),
);

export const DonationWebhookEvent = pgTable('donation_webhook_event', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  stripeCreatedAt: timestamp('stripe_created_at', {
    precision: 3,
  }).notNull(),
  processedAt: timestamp('processed_at', { precision: 3 })
    .notNull()
    .defaultNow(),
});

export const OidcAuthorizationCode = pgTable(
  'oidc_authorization_code',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // SHA-256 hash of the opaque code; the raw code is never stored.
    codeHash: text('code_hash').notNull().unique(),
    appUserId: uuid('app_user_id').notNull(),
    clientId: text('client_id').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    scope: text('scope').notNull(),
    nonce: text('nonce'),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: text('code_challenge_method')
      .notNull()
      .default('S256'),
    authTime: timestamp('auth_time', { precision: 3 }).notNull(),
    expiresAt: timestamp('expires_at', { precision: 3 }).notNull(),
    consumedAt: timestamp('consumed_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (OidcAuthorizationCode) => ({
    oidc_authorization_code_appUser_fkey: foreignKey({
      name: 'oidc_authorization_code_appUser_fkey',
      columns: [OidcAuthorizationCode.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const OidcRefreshToken = pgTable(
  'oidc_refresh_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // SHA-256 hash of the opaque refresh token; the raw token is never stored.
    tokenHash: text('token_hash').notNull().unique(),
    // Tokens minted from one authorization share a family; reuse of a rotated
    // token revokes the entire family.
    familyId: uuid('family_id').notNull(),
    appUserId: uuid('app_user_id').notNull(),
    clientId: text('client_id').notNull(),
    scope: text('scope').notNull(),
    authTime: timestamp('auth_time', { precision: 3 }).notNull(),
    expiresAt: timestamp('expires_at', { precision: 3 }).notNull(),
    rotatedAt: timestamp('rotated_at', { precision: 3 }),
    revokedAt: timestamp('revoked_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (OidcRefreshToken) => ({
    oidc_refresh_token_appUser_fkey: foreignKey({
      name: 'oidc_refresh_token_appUser_fkey',
      columns: [OidcRefreshToken.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    oidc_refresh_token_family_idx: index('oidc_refresh_token_family_idx').on(
      OidcRefreshToken.familyId,
    ),
  }),
);

export const ChannelSubscription = pgTable(
  'channel_subscription',
  {
    appUserId: uuid('app_user_id').notNull(),
    channelId: uuid('channel_id').notNull(),
  },
  (ChannelSubscription) => ({
    channel_subscription_appUser_fkey: foreignKey({
      name: 'channel_subscription_appUser_fkey',
      columns: [ChannelSubscription.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    channel_subscription_channel_fkey: foreignKey({
      name: 'channel_subscription_channel_fkey',
      columns: [ChannelSubscription.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    ChannelSubscription_cpk: primaryKey({
      name: 'ChannelSubscription_cpk',
      columns: [ChannelSubscription.appUserId, ChannelSubscription.channelId],
    }),
  }),
);

export const OrganizationTag = pgTable('organization_tag', {
  slug: citext('slug').notNull().primaryKey(),
  label: text('label').notNull(),
  description: text('description'),
  moreInfoLink: text('more_info_link'),
  category: OrganizationTagCategory('category').notNull(),
  color: TagColor('color').notNull().default('GRAY'),
});

export const OrganizationTagSuggestion = pgTable(
  'organization_tag_suggestion',
  {
    parentSlug: citext('parent_slug').notNull(),
    suggestedSlug: citext('recommended_slug').notNull(),
  },
  (OrganizationTagSuggestion) => ({
    organization_tag_suggestion_parent_fkey: foreignKey({
      name: 'organization_tag_suggestion_parent_fkey',
      columns: [OrganizationTagSuggestion.parentSlug],
      foreignColumns: [OrganizationTag.slug],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_tag_suggestion_suggested_fkey: foreignKey({
      name: 'organization_tag_suggestion_suggested_fkey',
      columns: [OrganizationTagSuggestion.suggestedSlug],
      foreignColumns: [OrganizationTag.slug],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    OrganizationTagSuggestion_cpk: primaryKey({
      name: 'OrganizationTagSuggestion_cpk',
      columns: [
        OrganizationTagSuggestion.parentSlug,
        OrganizationTagSuggestion.suggestedSlug,
      ],
    }),
  }),
);

export const OrganizationTagInstance = pgTable(
  'organization_tag_instance',
  {
    organizationId: uuid('organization_id').notNull(),
    tagSlug: citext('tag_slug').notNull(),
  },
  (OrganizationTagInstance) => ({
    organization_tag_instance_organization_fkey: foreignKey({
      name: 'organization_tag_instance_organization_fkey',
      columns: [OrganizationTagInstance.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_tag_instance_tag_fkey: foreignKey({
      name: 'organization_tag_instance_tag_fkey',
      columns: [OrganizationTagInstance.tagSlug],
      foreignColumns: [OrganizationTag.slug],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    OrganizationTagInstance_cpk: primaryKey({
      name: 'OrganizationTagInstance_cpk',
      columns: [
        OrganizationTagInstance.organizationId,
        OrganizationTagInstance.tagSlug,
      ],
    }),
  }),
);

export const Organization = pgTable(
  'organization',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: OrganizationType('type').notNull().default('MINISTRY'),
    name: text('name').notNull(),
    slug: citext('slug').notNull().unique(),
    avatarPath: text('avatar_path'),
    coverPath: text('cover_path'),
    primaryEmail: text('primary_email'),
    primaryPhoneNumber: text('primary_phone_number'),
    websiteUrl: text('website_url'),
    facebookUrl: text('facebook_url'),
    instagramUrl: text('instagram_url'),
    xUrl: text('x_url'),
    youtubeUrl: text('youtube_url'),
    tiktokUrl: text('tiktok_url'),
    linkedinUrl: text('linkedin_url'),
    threadsUrl: text('threads_url'),
    applePodcastsUrl: text('apple_podcasts_url'),
    spotifyUrl: text('spotify_url'),
    rssUrl: text('rss_url'),
    description: text('description'),
    automaticallyApproveOrganizationAssociations: boolean(
      'automatically_approve_organization_associations',
    )
      .notNull()
      .default(false),
    approvedById: uuid('approved_by_id'),
    approvedAt: timestamp('approved_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (Organization) => ({
    organization_approvedBy_fkey: foreignKey({
      name: 'organization_approvedBy_fkey',
      columns: [Organization.approvedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  }),
);

export const OrganizationAddress = pgTable(
  'organization_address',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    type: AddressType('type').notNull(),
    name: text('name'),
    query: text('query'),
    geocodingJson: jsonb('geocoding_json'),
    country: text('country'),
    locality: text('locality'),
    region: text('region'),
    postOfficeBoxNumber: text('post_office_box_number'),
    postalCode: text('postal_code'),
    streetAddress: text('street_address'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
  },
  (OrganizationAddress) => ({
    organization_address_organization_fkey: foreignKey({
      name: 'organization_address_organization_fkey',
      columns: [OrganizationAddress.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const OrganizationLeader = pgTable(
  'organization_leader',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    type: OrganizationLeaderType('type').notNull(),
    name: text('name'),
    email: text('email'),
    phoneNumber: text('phone_number'),
  },
  (OrganizationLeader) => ({
    organization_leader_organization_fkey: foreignKey({
      name: 'organization_leader_organization_fkey',
      columns: [OrganizationLeader.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const OrganizationMembership = pgTable(
  'organization_membership',
  {
    organizationId: uuid('organization_id').notNull(),
    appUserId: uuid('app_user_id').notNull(),
    isAdmin: boolean('is_admin').notNull().default(false),
    canEdit: boolean('can_edit').notNull().default(false),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (OrganizationMembership) => ({
    organization_membership_organization_fkey: foreignKey({
      name: 'organization_membership_organization_fkey',
      columns: [OrganizationMembership.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_membership_appUser_fkey: foreignKey({
      name: 'organization_membership_appUser_fkey',
      columns: [OrganizationMembership.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    OrganizationMembership_cpk: primaryKey({
      name: 'OrganizationMembership_cpk',
      columns: [
        OrganizationMembership.organizationId,
        OrganizationMembership.appUserId,
      ],
    }),
  }),
);

export const OrganizationInvitation = pgTable(
  'organization_invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull(),
    email: citext('email').notNull(),
    token: uuid('token').notNull().unique().defaultRandom(),
    status: InvitationStatus('status').notNull().default('PENDING'),
    isAdmin: boolean('is_admin').notNull().default(false),
    canEdit: boolean('can_edit').notNull().default(false),
    invitedById: uuid('invited_by_id'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { precision: 3 }).notNull(),
    respondedAt: timestamp('responded_at', { precision: 3 }),
  },
  (OrganizationInvitation) => ({
    organization_invitation_organization_fkey: foreignKey({
      name: 'organization_invitation_organization_fkey',
      columns: [OrganizationInvitation.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_invitation_invitedBy_fkey: foreignKey({
      name: 'organization_invitation_invitedBy_fkey',
      columns: [OrganizationInvitation.invitedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    OrganizationInvitation_organizationId_email_unique_idx: uniqueIndex(
      'OrganizationInvitation_organizationId_email_key',
    ).on(OrganizationInvitation.organizationId, OrganizationInvitation.email),
    organization_invitation_email_idx: index(
      'organization_invitation_email_idx',
    ).on(OrganizationInvitation.email),
    organization_invitation_status_expires_at_idx: index(
      'organization_invitation_status_expires_at_idx',
    ).on(OrganizationInvitation.status, OrganizationInvitation.expiresAt),
  }),
);

export const OrganizationOrganizationAssociation = pgTable(
  'organization_organization_association',
  {
    upstreamOrganizationId: uuid('upstream_organization_id').notNull(),
    downstreamOrganizationId: uuid('downstream_organization_id').notNull(),
    upstreamApproved: boolean('upstream_approved').notNull().default(false),
    downstreamApproved: boolean('downstream_approved').notNull().default(false),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (OrganizationOrganizationAssociation) => ({
    organization_organization_association_upstreamOrganization_fkey: foreignKey(
      {
        name: 'organization_organization_association_upstreamOrganization_fkey',
        columns: [OrganizationOrganizationAssociation.upstreamOrganizationId],
        foreignColumns: [Organization.id],
      },
    )
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_organization_association_downstreamOrganization_fkey:
      foreignKey({
        name: 'organization_organization_association_downstreamOrganization_fkey',
        columns: [OrganizationOrganizationAssociation.downstreamOrganizationId],
        foreignColumns: [Organization.id],
      })
        .onDelete('cascade')
        .onUpdate('cascade'),
    OrganizationOrganizationAssociation_cpk: primaryKey({
      name: 'OrganizationOrganizationAssociation_cpk',
      columns: [
        OrganizationOrganizationAssociation.upstreamOrganizationId,
        OrganizationOrganizationAssociation.downstreamOrganizationId,
      ],
    }),
  }),
);

export const OrganizationChannelAssociation = pgTable(
  'organization_channel_association',
  {
    organizationId: uuid('organization_id').notNull(),
    channelId: uuid('channel_id').notNull(),
    officialChannel: boolean('official_channel').notNull().default(false),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (OrganizationChannelAssociation) => ({
    organization_channel_association_organization_fkey: foreignKey({
      name: 'organization_channel_association_organization_fkey',
      columns: [OrganizationChannelAssociation.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    organization_channel_association_channel_fkey: foreignKey({
      name: 'organization_channel_association_channel_fkey',
      columns: [OrganizationChannelAssociation.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    OrganizationChannelAssociation_cpk: primaryKey({
      name: 'OrganizationChannelAssociation_cpk',
      columns: [
        OrganizationChannelAssociation.organizationId,
        OrganizationChannelAssociation.channelId,
      ],
    }),
  }),
);

export const Channel = pgTable(
  'channel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    visibility: ChannelVisibility('visibility').notNull().default('PUBLIC'),
    avatarPath: varchar('avatar_path', { length: 255 }),
    avatarBlurhash: varchar('avatar_blurhash', { length: 255 }),
    coverPath: varchar('cover_path', { length: 255 }),
    coverBlurhash: varchar('cover_blurhash', { length: 255 }),
    slug: citext('slug').notNull().unique(),
    description: text('description'),
    websiteUrl: text('website_url'),
    facebookUrl: text('facebook_url'),
    instagramUrl: text('instagram_url'),
    xUrl: text('x_url'),
    youtubeUrl: text('youtube_url'),
    tiktokUrl: text('tiktok_url'),
    linkedinUrl: text('linkedin_url'),
    threadsUrl: text('threads_url'),
    applePodcastsUrl: text('apple_podcasts_url'),
    spotifyUrl: text('spotify_url'),
    rssUrl: text('rss_url'),
    approvedById: uuid('approved_by_id'),
    approvedAt: timestamp('approved_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp('deleted_at', { precision: 3 }),
    defaultThumbnailPath: varchar('default_thumbnail_path', { length: 255 }),
    defaultThumbnailBlurhash: varchar('default_thumbnail_blurhash', {
      length: 255,
    }),
    defaultUploadVisibility: UploadVisibility('default_upload_visibility'),
    defaultUploadLicense: UploadLicense('default_upload_license'),
    defaultUploadCommentsEnabled: boolean('default_upload_comments_enabled'),
    defaultUploadDownloadsEnabled: boolean('default_upload_downloads_enabled'),
  },
  (Channel) => ({
    channel_approvedBy_fkey: foreignKey({
      name: 'channel_approvedBy_fkey',
      columns: [Channel.approvedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  }),
);

export const ChannelMembership = pgTable(
  'channel_membership',
  {
    channelId: uuid('channel_id').notNull(),
    appUserId: uuid('app_user_id').notNull(),
    isAdmin: boolean('is_admin').notNull().default(false),
    canEdit: boolean('can_edit').notNull().default(false),
    canUpload: boolean('can_upload').notNull().default(true),
    canDownload: boolean('can_download').notNull().default(false),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (ChannelMembership) => ({
    channel_membership_channel_fkey: foreignKey({
      name: 'channel_membership_channel_fkey',
      columns: [ChannelMembership.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    channel_membership_appUser_fkey: foreignKey({
      name: 'channel_membership_appUser_fkey',
      columns: [ChannelMembership.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    ChannelMembership_cpk: primaryKey({
      name: 'ChannelMembership_cpk',
      columns: [ChannelMembership.channelId, ChannelMembership.appUserId],
    }),
  }),
);

export const ChannelInvitation = pgTable(
  'channel_invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id').notNull(),
    email: citext('email').notNull(),
    token: uuid('token').notNull().unique().defaultRandom(),
    status: InvitationStatus('status').notNull().default('PENDING'),
    isAdmin: boolean('is_admin').notNull().default(false),
    canEdit: boolean('can_edit').notNull().default(false),
    canUpload: boolean('can_upload').notNull().default(true),
    canDownload: boolean('can_download').notNull().default(false),
    invitedById: uuid('invited_by_id'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { precision: 3 }).notNull(),
    respondedAt: timestamp('responded_at', { precision: 3 }),
  },
  (ChannelInvitation) => ({
    channel_invitation_channel_fkey: foreignKey({
      name: 'channel_invitation_channel_fkey',
      columns: [ChannelInvitation.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    channel_invitation_invitedBy_fkey: foreignKey({
      name: 'channel_invitation_invitedBy_fkey',
      columns: [ChannelInvitation.invitedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    ChannelInvitation_channelId_email_unique_idx: uniqueIndex(
      'ChannelInvitation_channelId_email_key',
    ).on(ChannelInvitation.channelId, ChannelInvitation.email),
    channel_invitation_email_idx: index('channel_invitation_email_idx').on(
      ChannelInvitation.email,
    ),
    channel_invitation_status_expires_at_idx: index(
      'channel_invitation_status_expires_at_idx',
    ).on(ChannelInvitation.status, ChannelInvitation.expiresAt),
  }),
);

// Persistent, per-channel Mux live stream. One row per channel that has
// provisioned live streaming. The Mux live stream id + stream key are
// reused across an unlimited number of broadcasts (like a YouTube channel
// key); each RTMP session creates a fresh Mux asset that we later import.
export const ChannelLiveStream = pgTable(
  'channel_live_stream',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id').notNull().unique(),
    // Mux Live Stream id. The (sensitive) RTMP stream key is NOT stored — it's
    // fetched from the Mux API on demand when an admin views the config.
    muxLiveStreamId: text('mux_live_stream_id').notNull().unique(),
    // Playback id for the live HLS manifest (stream.mux.com/{id}.m3u8).
    muxPlaybackId: text('mux_playback_id'),
    latencyMode: text('latency_mode').notNull().default('standard'),
    reconnectWindow: integer('reconnect_window').notNull().default(60),
    // Mux live-stream status, kept in sync via webhooks: idle | active |
    // disconnected | disabled.
    status: text('status').notNull().default('idle'),
    // Metadata applied to the UploadRecord created when the stream next goes
    // active. Null fields fall back to the channel's upload defaults.
    nextTitle: text('next_title'),
    nextDescription: text('next_description'),
    nextVisibility: UploadVisibility('next_visibility'),
    nextLicense: UploadLicense('next_license'),
    nextCommentsEnabled: boolean('next_comments_enabled'),
    nextDownloadsEnabled: boolean('next_downloads_enabled'),
    // Optional series (upload_list) to add the next broadcast to. Stored as a
    // plain id (no FK — upload_list is declared later in this file); the
    // webhook verifies it still belongs to the channel before using it.
    nextSeriesId: uuid('next_series_id'),
    createdById: uuid('created_by_id'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (ChannelLiveStream) => ({
    channel_live_stream_channel_fkey: foreignKey({
      name: 'channel_live_stream_channel_fkey',
      columns: [ChannelLiveStream.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    channel_live_stream_createdBy_fkey: foreignKey({
      name: 'channel_live_stream_createdBy_fkey',
      columns: [ChannelLiveStream.createdById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  }),
);

// Simulcast (restream) targets for a channel's live stream. Mux passes the
// ingested feed through to each enabled RTMP/RTMPS target (YouTube, Facebook,
// etc.) — up to six per live stream.
export const ChannelSimulcastTarget = pgTable(
  'channel_simulcast_target',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelLiveStreamId: uuid('channel_live_stream_id').notNull(),
    muxSimulcastTargetId: text('mux_simulcast_target_id').notNull(),
    label: text('label'),
    url: text('url').notNull(),
    // Stream key is sent to Mux on creation and not stored (Mux treats it as
    // write-only and never returns it).
    enabled: boolean('enabled').notNull().default(true),
    // Mux simulcast target status, synced via webhooks: idle | starting |
    // broadcasting | errored.
    status: text('status').notNull().default('idle'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (ChannelSimulcastTarget) => ({
    channel_simulcast_target_liveStream_fkey: foreignKey({
      name: 'channel_simulcast_target_liveStream_fkey',
      columns: [ChannelSimulcastTarget.channelLiveStreamId],
      foreignColumns: [ChannelLiveStream.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  }),
);

export const UploadState = pgTable(
  'upload_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    s3Key: text('s3_key').notNull().unique(),
    s3Bucket: text('s3_bucket').notNull(),
    uploadType: UploadStateType('upload_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }),
    uploadRecordId: uuid('upload_record_id'),
    appUserId: uuid('app_user_id'),
    channelId: uuid('channel_id'),
    organizationId: uuid('organization_id'),
    backupStatus: BackupStatus('backup_status')
      .notNull()
      .default('NOT_BACKED_UP'),
    backupKey: text('backup_key'),
    backedUpAt: timestamp('backed_up_at', { precision: 3 }),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (UploadState) => ({
    upload_state_uploadRecord_fkey: foreignKey({
      name: 'upload_state_uploadRecord_fkey',
      columns: [UploadState.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    upload_state_appUser_fkey: foreignKey({
      name: 'upload_state_appUser_fkey',
      columns: [UploadState.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    upload_state_channel_fkey: foreignKey({
      name: 'upload_state_channel_fkey',
      columns: [UploadState.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    upload_state_organization_fkey: foreignKey({
      name: 'upload_state_organization_fkey',
      columns: [UploadState.organizationId],
      foreignColumns: [Organization.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    upload_state_backup_status_idx: index('upload_state_backup_status_idx').on(
      UploadState.backupStatus,
    ),
    upload_state_upload_type_idx: index('upload_state_upload_type_idx').on(
      UploadState.uploadType,
    ),
  }),
);

// One row per storage-audit run (admin-triggered, read-only S3 reconciliation).
// Holds run status, a compact JSON summary (counts + capped sample findings),
// and the S3 key of the full report. Powers the admin storage-audit page and
// keeps run history. See storageAuditWorkflow.
export const StorageAudit = pgTable(
  'storage_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: StorageAuditStatus('status').notNull().default('RUNNING'),
    triggeredById: uuid('triggered_by_id'),
    startedAt: timestamp('started_at', { precision: 3 }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { precision: 3 }),
    // Compact summary: per-bucket/category counts + capped sample findings.
    // The full, uncapped findings live in the S3 report at reportS3Key.
    summary: jsonb('summary'),
    reportS3Key: text('report_s3_key'),
    error: text('error'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (StorageAudit) => ({
    storage_audit_triggeredBy_fkey: foreignKey({
      name: 'storage_audit_triggeredBy_fkey',
      columns: [StorageAudit.triggeredById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  }),
);

export const UploadRecord = pgTable(
  'upload_record',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title'),
    description: text('description'),
    appUserId: uuid('app_user_id').notNull(),
    license: UploadLicense('license').notNull(),
    channelId: uuid('channel_id').notNull(),
    visibility: UploadVisibility('visibility').notNull(),
    uploadSizeBytes: bigint('upload_size_bytes', { mode: 'bigint' }),
    uploadFinalized: boolean('upload_finalized').notNull().default(false),
    uploadFinalizedAt: timestamp('upload_finalized_at', { precision: 3 }),
    uploadFinalizedById: uuid('upload_finalized_by_id'),
    finalizedUploadKey: text('finalized_upload_key'),
    originalFileName: text('original_file_name'),
    probe: jsonb('probe'),
    defaultThumbnailPath: text('default_thumbnail_path'),
    defaultThumbnailBlurhash: text('default_thumbnail_blurhash'),
    overrideThumbnailPath: text('override_thumbnail_path'),
    overrideThumbnailBlurhash: text('override_thumbnail_blurhash'),
    thumbnailCount: integer('thumbnail_count'),
    lengthSeconds: doublePrecision('length_seconds'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
    publishedAt: timestamp('published_at', { precision: 3 })
      .notNull()
      .defaultNow(),
    transcodingStartedAt: timestamp('transcoding_started_at', { precision: 3 }),
    transcodingFinishedAt: timestamp('transcoding_finished_at', {
      precision: 3,
    }),
    transcodingProgress: doublePrecision('transcoding_progress')
      .notNull()
      .default(0),
    transcribingStartedAt: timestamp('transcribing_started_at', {
      precision: 3,
    }),
    transcribingFinishedAt: timestamp('transcribing_finished_at', {
      precision: 3,
    }),
    transcribingProgress: doublePrecision('transcribing_progress')
      .notNull()
      .default(0),
    deletedAt: timestamp('deleted_at', { precision: 3 }),
    variants: UploadVariant('variants').array().notNull(),
    score: doublePrecision('score').notNull().default(0),
    scoreStaleAt: timestamp('score_stale_at', { precision: 3 }).defaultNow(),
    userCommentsEnabled: boolean('user_comments_enabled')
      .notNull()
      .default(true),
    downloadsEnabled: boolean('downloads_enabled').notNull().default(true),
    pipelineVersion: integer('pipeline_version').notNull().default(2),
    // How the most recent transcode encoded this upload.
    //   transcodeEncoder — 'libx264' (software) or 'h264_ama' (MA35
    //     hardware); null for uploads transcoded before this was tracked
    //     (their encoder is genuinely unknown).
    transcodeEncoder: TranscodeEncoder('transcode_encoder'),
    // Display summary (frontend Summary tab). Populated by the summarize-upload
    // activity after transcript paragraphs land.
    summary: text('summary'),
    // Search-optimized restatement (concepts/entities/scripture refs); never
    // rendered to users, exists only to be embedded for similarity search.
    searchSummary: text('search_summary'),
    // 1536-dim OpenAI text-embedding-3-small vectors. JSONB now; convertible
    // to pgvector when the extension is enabled (same plan as speaker_embedding).
    summaryEmbedding: jsonb('summary_embedding').$type<number[]>(),
    searchSummaryEmbedding: jsonb('search_summary_embedding').$type<number[]>(),
    summarizedAt: timestamp('summarized_at', { precision: 3 }),
    // YouTube-style outline panel: per-section description tied to one
    // OUTLINE annotation. Populated by the summarize activity, which
    // reads outlines from `annotation` (written by annotate first) and
    // generates a 2-3 sentence description for each section. Empty
    // array when the upload has no outlines or summarize hasn't run.
    //   { id: <annotation.id>, description: string }
    // Frontend joins this with the annotation table for titles +
    // paragraph anchors (which give the start/end timestamps).
    sections: jsonb('sections')
      .$type<Array<{ id: string; description: string }>>()
      .notNull()
      .default([]),
    // Live broadcast (Mux) fields. A broadcast is a single UploadRecord that
    // plays Mux's live HLS while `is_live_broadcast` is true and the CDN
    // variants haven't landed yet; once the recording is imported and
    // transcoded, the same record serves our CDN exactly like any other VOD.
    //   muxAssetId — the per-broadcast Mux asset (the recording).
    //   muxPlaybackId — playback id for the live HLS manifest.
    isLiveBroadcast: boolean('is_live_broadcast').notNull().default(false),
    muxAssetId: text('mux_asset_id'),
    muxPlaybackId: text('mux_playback_id'),
    liveStartedAt: timestamp('live_started_at', { precision: 3 }),
    liveEndedAt: timestamp('live_ended_at', { precision: 3 }),
  },
  (UploadRecord) => ({
    upload_record_createdBy_fkey: foreignKey({
      name: 'upload_record_createdBy_fkey',
      columns: [UploadRecord.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    upload_record_channel_fkey: foreignKey({
      name: 'upload_record_channel_fkey',
      columns: [UploadRecord.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_record_uploadFinalizedBy_fkey: foreignKey({
      name: 'upload_record_uploadFinalizedBy_fkey',
      columns: [UploadRecord.uploadFinalizedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    upload_record_created_at_id_idx: index(
      'upload_record_created_at_id_idx',
    ).on(UploadRecord.createdAt, UploadRecord.id),
    upload_record_score_idx: index('upload_record_score_idx').on(
      UploadRecord.score,
    ),
    upload_record_score_stale_at_idx: index(
      'upload_record_score_stale_at_idx',
    ).on(UploadRecord.scoreStaleAt),
  }),
);

export const TranscriptParagraph = pgTable(
  'transcript_paragraph',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uploadRecordId: uuid('upload_record_id').notNull(),
    // Paragraph order within the upload.
    order: integer('order').notNull(),
    // Seconds (matches the worker's transcript.json word/segment timings).
    start: doublePrecision('start').notNull(),
    end: doublePrecision('end').notNull(),
    // Worker-local speaker label (e.g. SPEAKER_00); not yet surfaced in the UI.
    speaker: text('speaker'),
    // 192-dim titanet embedding for this paragraph's speaker (denormalized;
    // speaker identity/dedup is a later concern). JSONB now; convertible to a
    // pgvector column later if/when the extension is enabled.
    speakerEmbedding: jsonb('speaker_embedding').$type<number[]>(),
    text: text('text').notNull(),
    // Per-word timings for in-player word-level highlighting.
    words: jsonb('words')
      .$type<Array<{ word: string; start: number; end: number }>>()
      .notNull(),
    // 1536-dim OpenAI text-embedding-3-small vector for this paragraph's text
    // (semantic search signal). Same JSONB-now / pgvector-later pattern as
    // speaker_embedding above.
    embedding: jsonb('embedding').$type<number[]>(),
  },
  (TranscriptParagraph) => ({
    transcript_paragraph_uploadRecord_fkey: foreignKey({
      name: 'transcript_paragraph_uploadRecord_fkey',
      columns: [TranscriptParagraph.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    TranscriptParagraph_uploadRecordId_order_idx: uniqueIndex(
      'transcript_paragraph_upload_record_id_order_idx',
    ).on(TranscriptParagraph.uploadRecordId, TranscriptParagraph.order),
  }),
);

// Persisted "story window" embeddings. A window concatenates WINDOW_SIZE
// consecutive paragraphs (see temporal/src/util/windows.ts); its text has no
// vector of its own, so before this table every reindex re-embedded every
// window of every upload from scratch — the dominant cost of a full pass.
//
// `textHash` makes reuse self-invalidating: the cache key is the window's
// concatenated text, so any paragraph rewrite (re-transcribe, diarization
// merge) changes the hash and forces a re-embed without the paragraph writers
// needing to know this table exists. Rows for windows that no longer exist are
// pruned at index time.
export const TranscriptWindow = pgTable(
  'transcript_window',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uploadRecordId: uuid('upload_record_id').notNull(),
    // Paragraph `order` bounds of the window, inclusive. `startOrder` is the
    // stable per-upload identity of a window (stride is fixed).
    startOrder: integer('start_order').notNull(),
    endOrder: integer('end_order').notNull(),
    // Seconds, mirroring transcript_paragraph.start/end.
    start: doublePrecision('start').notNull(),
    end: doublePrecision('end').notNull(),
    // sha256 of the window's concatenated text — the reuse key (see above).
    textHash: text('text_hash').notNull(),
    // 1536-dim OpenAI text-embedding-3-small vector. Same JSONB-now /
    // pgvector-later pattern as transcript_paragraph.embedding.
    embedding: jsonb('embedding').$type<number[]>().notNull(),
  },
  (TranscriptWindow) => ({
    transcript_window_uploadRecord_fkey: foreignKey({
      name: 'transcript_window_uploadRecord_fkey',
      columns: [TranscriptWindow.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    TranscriptWindow_uploadRecordId_startOrder_idx: uniqueIndex(
      'transcript_window_upload_record_id_start_order_idx',
    ).on(TranscriptWindow.uploadRecordId, TranscriptWindow.startOrder),
  }),
);

export const Annotation = pgTable(
  'annotation',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paragraphId: uuid('paragraph_id').notNull(),
    kind: AnnotationKind('kind').notNull(),
    // Half-open word range [startWord, endWord) into paragraph.words[].
    // Set for inline kinds (BIBLE, KEYWORD); null for block kinds (OUTLINE
    // attaches to the whole paragraph as "this paragraph opens a section").
    // Word-level (not char) granularity is robust to the LLM lightly editing
    // surrounding text — at worst we lose an annotation, never cut a word.
    startWord: integer('start_word'),
    endWord: integer('end_word'),
    // The LLM's verbatim span (as it returned it). Debug-only: the canonical
    // text-of-record for an inline annotation is `words[startWord..endWord]`
    // on the parent paragraph, and OUTLINE titles live in `metadata.title`.
    // We keep `rawSpan` so SELECT statements show what each row covers
    // without joining + slicing, and so we can audit cases where the LLM's
    // span drifts from the canonical word-tokenization. Null for OUTLINE
    // (no span exists).
    rawSpan: text('raw_span'),
    // The only multiplexed column — kind-specific payload. Typed at usage
    // sites with a small zod schema:
    //   OUTLINE: { level: 1 | 2 | 3, title: string }
    //   BIBLE:   { book: string /* OSIS, e.g. "1Cor" */, chapter: number,
    //              verse?: number, endChapter?: number, endVerse?: number }
    //   KEYWORD: {} (placeholder for future per-keyword metadata)
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (Annotation) => ({
    annotation_paragraph_fkey: foreignKey({
      name: 'annotation_paragraph_fkey',
      columns: [Annotation.paragraphId],
      foreignColumns: [TranscriptParagraph.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    annotation_paragraph_kind_idx: index('annotation_paragraph_kind_idx').on(
      Annotation.paragraphId,
      Annotation.kind,
    ),
  }),
);

// A named speaker identity owned by a channel. Diarized paragraph labels
// (transcript_paragraph.speaker, e.g. SPEAKER_00) are attributed to these via
// speaker_attribution; the 192-dim titanet embeddings power kNN candidate
// suggestions. slug/bio/avatar are reserved so a public profile page can be
// added later without a migration.
export const Speaker = pgTable(
  'speaker',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    bio: text('bio'),
    avatarPath: text('avatar_path'),
    avatarBlurhash: text('avatar_blurhash'),
    createdById: uuid('created_by_id'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
    deletedAt: timestamp('deleted_at', { precision: 3 }),
  },
  (Speaker) => ({
    speaker_channel_fkey: foreignKey({
      name: 'speaker_channel_fkey',
      columns: [Speaker.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    speaker_createdBy_fkey: foreignKey({
      name: 'speaker_createdBy_fkey',
      columns: [Speaker.createdById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    Speaker_channelId_slug_idx: uniqueIndex('speaker_channel_id_slug_key').on(
      Speaker.channelId,
      Speaker.slug,
    ),
    Speaker_channelId_idx: index('speaker_channel_id_idx').on(
      Speaker.channelId,
    ),
  }),
);

// Per-paragraph effective-label override. Lets a user reassign an individual
// paragraph to a different (or new) speaker label before attributing — fixing
// diarization splits/merges. Absent => effective label is the paragraph's
// diarization speaker. Reset on reprocess (delete+insert of paragraphs), same
// as annotations.
export const SpeakerParagraphLabel = pgTable(
  'speaker_paragraph_label',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paragraphId: uuid('paragraph_id').notNull(),
    label: text('label').notNull(),
    createdById: uuid('created_by_id'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (SpeakerParagraphLabel) => ({
    speaker_paragraph_label_paragraph_fkey: foreignKey({
      name: 'speaker_paragraph_label_paragraph_fkey',
      columns: [SpeakerParagraphLabel.paragraphId],
      foreignColumns: [TranscriptParagraph.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    speaker_paragraph_label_createdBy_fkey: foreignKey({
      name: 'speaker_paragraph_label_createdBy_fkey',
      columns: [SpeakerParagraphLabel.createdById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    SpeakerParagraphLabel_paragraphId_idx: uniqueIndex(
      'speaker_paragraph_label_paragraph_id_key',
    ).on(SpeakerParagraphLabel.paragraphId),
  }),
);

// Maps an (upload, effective-label) pair to a speaker identity. Labeling one
// paragraph names every paragraph with that effective label in the upload. The
// speakerId may belong to another channel only when an ACCEPTED speaker_link
// authorizes it (enforced in the tRPC layer, not by a DB constraint).
export const SpeakerAttribution = pgTable(
  'speaker_attribution',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploadRecordId: uuid('upload_record_id').notNull(),
    speakerLabel: text('speaker_label').notNull(),
    speakerId: uuid('speaker_id').notNull(),
    createdById: uuid('created_by_id'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull(),
  },
  (SpeakerAttribution) => ({
    speaker_attribution_uploadRecord_fkey: foreignKey({
      name: 'speaker_attribution_uploadRecord_fkey',
      columns: [SpeakerAttribution.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    speaker_attribution_speaker_fkey: foreignKey({
      name: 'speaker_attribution_speaker_fkey',
      columns: [SpeakerAttribution.speakerId],
      foreignColumns: [Speaker.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    speaker_attribution_createdBy_fkey: foreignKey({
      name: 'speaker_attribution_createdBy_fkey',
      columns: [SpeakerAttribution.createdById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    SpeakerAttribution_uploadRecordId_speakerLabel_idx: uniqueIndex(
      'speaker_attribution_upload_record_id_speaker_label_key',
    ).on(SpeakerAttribution.uploadRecordId, SpeakerAttribution.speakerLabel),
    SpeakerAttribution_speakerId_idx: index(
      'speaker_attribution_speaker_id_idx',
    ).on(SpeakerAttribution.speakerId),
  }),
);

// A cross-channel grant: requestingChannel asks to attribute its uploads to
// another channel's speaker, approved by the owning channel (mirrors
// channel_invitation). Scope is decided at approval time: grantedUploadId set =>
// that upload only; null + ACCEPTED => channel-wide. requestedForUploadId
// records the upload the requester was labeling when they asked.
export const SpeakerLink = pgTable(
  'speaker_link',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    speakerId: uuid('speaker_id').notNull(),
    requestingChannelId: uuid('requesting_channel_id').notNull(),
    status: InvitationStatus('status').notNull().default('PENDING'),
    requestedForUploadId: uuid('requested_for_upload_id'),
    grantedUploadId: uuid('granted_upload_id'),
    requestedById: uuid('requested_by_id'),
    respondedById: uuid('responded_by_id'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { precision: 3 }),
  },
  (SpeakerLink) => ({
    speaker_link_speaker_fkey: foreignKey({
      name: 'speaker_link_speaker_fkey',
      columns: [SpeakerLink.speakerId],
      foreignColumns: [Speaker.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    speaker_link_requestingChannel_fkey: foreignKey({
      name: 'speaker_link_requestingChannel_fkey',
      columns: [SpeakerLink.requestingChannelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    speaker_link_requestedForUpload_fkey: foreignKey({
      name: 'speaker_link_requestedForUpload_fkey',
      columns: [SpeakerLink.requestedForUploadId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    speaker_link_grantedUpload_fkey: foreignKey({
      name: 'speaker_link_grantedUpload_fkey',
      columns: [SpeakerLink.grantedUploadId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    speaker_link_requestedBy_fkey: foreignKey({
      name: 'speaker_link_requestedBy_fkey',
      columns: [SpeakerLink.requestedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    speaker_link_respondedBy_fkey: foreignKey({
      name: 'speaker_link_respondedBy_fkey',
      columns: [SpeakerLink.respondedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    SpeakerLink_speakerId_requestingChannelId_idx: uniqueIndex(
      'speaker_link_speaker_id_requesting_channel_id_key',
    ).on(SpeakerLink.speakerId, SpeakerLink.requestingChannelId),
    SpeakerLink_requestingChannelId_idx: index(
      'speaker_link_requesting_channel_id_idx',
    ).on(SpeakerLink.requestingChannelId),
  }),
);

// A request from a speaker's OWNING channel asking the channel that owns an
// upload to tag that speaker on a specific (upload, effective-label) segment.
// The reverse of speaker_link: here the speaker owner initiates after spotting
// an untagged appearance, and the content channel (the upload's channel)
// approves — which performs the attribution. Reuses InvitationStatus.
export const SpeakerTagRequest = pgTable(
  'speaker_tag_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    speakerId: uuid('speaker_id').notNull(),
    uploadRecordId: uuid('upload_record_id').notNull(),
    speakerLabel: text('speaker_label').notNull(),
    status: InvitationStatus('status').notNull().default('PENDING'),
    requestedById: uuid('requested_by_id'),
    respondedById: uuid('responded_by_id'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { precision: 3 }),
  },
  (SpeakerTagRequest) => ({
    speaker_tag_request_speaker_fkey: foreignKey({
      name: 'speaker_tag_request_speaker_fkey',
      columns: [SpeakerTagRequest.speakerId],
      foreignColumns: [Speaker.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    speaker_tag_request_uploadRecord_fkey: foreignKey({
      name: 'speaker_tag_request_uploadRecord_fkey',
      columns: [SpeakerTagRequest.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    speaker_tag_request_requestedBy_fkey: foreignKey({
      name: 'speaker_tag_request_requestedBy_fkey',
      columns: [SpeakerTagRequest.requestedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    speaker_tag_request_respondedBy_fkey: foreignKey({
      name: 'speaker_tag_request_respondedBy_fkey',
      columns: [SpeakerTagRequest.respondedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    SpeakerTagRequest_speaker_upload_label_idx: uniqueIndex(
      'speaker_tag_request_speaker_upload_label_key',
    ).on(
      SpeakerTagRequest.speakerId,
      SpeakerTagRequest.uploadRecordId,
      SpeakerTagRequest.speakerLabel,
    ),
    SpeakerTagRequest_uploadRecordId_idx: index(
      'speaker_tag_request_upload_record_id_idx',
    ).on(SpeakerTagRequest.uploadRecordId),
  }),
);

export const UploadUserRating = pgTable(
  'upload_user_rating',
  {
    appUserId: uuid('app_user_id').notNull(),
    uploadRecordId: uuid('upload_id').notNull(),
    rating: Rating('rating').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (UploadUserRating) => ({
    upload_user_rating_appUser_fkey: foreignKey({
      name: 'upload_user_rating_appUser_fkey',
      columns: [UploadUserRating.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_user_rating_uploadRecord_fkey: foreignKey({
      name: 'upload_user_rating_uploadRecord_fkey',
      columns: [UploadUserRating.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    UploadUserRating_cpk: primaryKey({
      name: 'UploadUserRating_cpk',
      columns: [UploadUserRating.appUserId, UploadUserRating.uploadRecordId],
    }),
    upload_user_rating_upload_id_rating_idx: index(
      'upload_user_rating_upload_id_rating_idx',
    ).on(UploadUserRating.uploadRecordId, UploadUserRating.rating),
    upload_user_rating_app_user_id_rating_idx: index(
      'upload_user_rating_app_user_id_rating_idx',
    ).on(UploadUserRating.appUserId, UploadUserRating.rating),
  }),
);

export const UploadUserComment = pgTable(
  'upload_user_comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
    authorId: uuid('author_id').notNull(),
    uploadRecordId: uuid('upload_id').notNull(),
    replyingToId: uuid('replying_to_id'),
    text: text('text').notNull(),
    score: doublePrecision('score').notNull().default(0),
    scoreStaleAt: timestamp('score_stale_at', { precision: 3 }).defaultNow(),
  },
  (UploadUserComment) => ({
    upload_user_comment_author_fkey: foreignKey({
      name: 'upload_user_comment_author_fkey',
      columns: [UploadUserComment.authorId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_user_comment_replying_to_id_idx: index(
      'upload_user_comment_replying_to_id_idx',
    ).on(UploadUserComment.replyingToId),
    upload_user_comment_score_idx: index('upload_user_comment_score_idx').on(
      UploadUserComment.score,
    ),
    upload_user_comment_score_stale_at_idx: index(
      'upload_user_comment_score_stale_at_idx',
    ).on(UploadUserComment.scoreStaleAt),
    upload_user_comment_upload_fkey: foreignKey({
      name: 'upload_user_comment_upload_fkey',
      columns: [UploadUserComment.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_user_comment_replyingTo_fkey: foreignKey({
      name: 'upload_user_comment_replyingTo_fkey',
      columns: [UploadUserComment.replyingToId],
      foreignColumns: [UploadUserComment.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
  }),
);

export const UploadUserCommentRating = pgTable(
  'upload_user_comment_rating',
  {
    appUserId: uuid('app_user_id').notNull(),
    uploadUserCommentId: uuid('upload_user_comment_id').notNull(),
    rating: Rating('rating').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (UploadUserCommentRating) => ({
    upload_user_comment_rating_appUser_fkey: foreignKey({
      name: 'upload_user_comment_rating_appUser_fkey',
      columns: [UploadUserCommentRating.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_user_comment_rating_uploadUserComment_fkey: foreignKey({
      name: 'upload_user_comment_rating_uploadUserComment_fkey',
      columns: [UploadUserCommentRating.uploadUserCommentId],
      foreignColumns: [UploadUserComment.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    UploadUserCommentRating_cpk: primaryKey({
      name: 'UploadUserCommentRating_cpk',
      columns: [
        UploadUserCommentRating.appUserId,
        UploadUserCommentRating.uploadUserCommentId,
      ],
    }),
    upload_user_comment_rating_upload_user_comment_id_rating_idx: index(
      'upload_user_comment_rating_upload_user_comment_id_rating_idx',
    ).on(
      UploadUserCommentRating.uploadUserCommentId,
      UploadUserCommentRating.rating,
    ),
    upload_user_comment_rating_app_user_id_rating_idx: index(
      'upload_user_comment_rating_app_user_id_rating_idx',
    ).on(UploadUserCommentRating.appUserId, UploadUserCommentRating.rating),
  }),
);

export const UploadView = pgTable(
  'upload_view',
  {
    uploadRecordId: uuid('upload_record_id').notNull(),
    viewHash: bigint('view_hash', { mode: 'bigint' }).notNull(),
    appUserId: uuid('app_user_id'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    count: integer('count').notNull().default(1),
    source: UploadViewSource('source').default('WEBSITE'),
  },
  (UploadView) => ({
    upload_view_upload_fkey: foreignKey({
      name: 'upload_view_upload_fkey',
      columns: [UploadView.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_view_user_fkey: foreignKey({
      name: 'upload_view_user_fkey',
      columns: [UploadView.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    UploadView_cpk: primaryKey({
      name: 'UploadView_cpk',
      columns: [UploadView.uploadRecordId, UploadView.viewHash],
    }),
    upload_view_app_user_id_upload_record_id_idx: index(
      'upload_view_app_user_id_upload_record_id_idx',
    ).on(UploadView.appUserId, UploadView.uploadRecordId),
    upload_view_created_at_idx: index('upload_view_created_at_idx').on(
      UploadView.createdAt,
    ),
  }),
);

export const UploadViewSecond = pgTable(
  'upload_view_second',
  {
    uploadRecordId: uuid('upload_record_id').notNull(),
    viewHash: bigint('view_hash', { mode: 'bigint' }).notNull(),
    second: integer('second').notNull(),
  },
  (UploadViewSecond) => ({
    upload_view_second_view_fkey: foreignKey({
      name: 'upload_view_second_view_fkey',
      columns: [UploadViewSecond.uploadRecordId, UploadViewSecond.viewHash],
      foreignColumns: [UploadView.uploadRecordId, UploadView.viewHash],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    UploadViewSecond_cpk: primaryKey({
      name: 'UploadViewSecond_cpk',
      columns: [
        UploadViewSecond.uploadRecordId,
        UploadViewSecond.viewHash,
        UploadViewSecond.second,
      ],
    }),
    upload_view_second_upload_record_id_second_idx: index(
      'upload_view_second_upload_record_id_second_idx',
    ).on(UploadViewSecond.uploadRecordId, UploadViewSecond.second),
  }),
);

export const UploadListEntry = pgTable(
  'upload_list_entry',
  {
    uploadListId: uuid('upload_list_id').notNull(),
    uploadRecordId: uuid('upload_record_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    rank: integer('rank'),
  },
  (UploadListEntry) => ({
    upload_list_entry_uploadList_fkey: foreignKey({
      name: 'upload_list_entry_uploadList_fkey',
      columns: [UploadListEntry.uploadListId],
      foreignColumns: [UploadList.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_list_entry_upload_fkey: foreignKey({
      name: 'upload_list_entry_upload_fkey',
      columns: [UploadListEntry.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    UploadListEntry_cpk: primaryKey({
      name: 'UploadListEntry_cpk',
      columns: [UploadListEntry.uploadListId, UploadListEntry.uploadRecordId],
    }),
    upload_list_entry_upload_list_id_rank_created_at_idx: index(
      'upload_list_entry_upload_list_id_rank_created_at_idx',
    ).on(
      UploadListEntry.uploadListId,
      UploadListEntry.rank,
      UploadListEntry.createdAt,
    ),
  }),
);

export const UploadList = pgTable(
  'upload_list',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
    title: text('title').notNull(),
    authorId: uuid('author_id').notNull(),
    channelId: uuid('channel_id'),
    type: UploadListType('type').notNull(),
    visibility: UploadListVisibility('visibility').notNull().default('PUBLIC'),
  },
  (UploadList) => ({
    upload_list_author_fkey: foreignKey({
      name: 'upload_list_author_fkey',
      columns: [UploadList.authorId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    upload_list_channel_fkey: foreignKey({
      name: 'upload_list_channel_fkey',
      columns: [UploadList.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    UploadList_createdAt_id_unique_idx: uniqueIndex(
      'UploadList_createdAt_id_key',
    ).on(UploadList.createdAt, UploadList.id),
  }),
);

export const SearchLogEntry = pgTable(
  'search_log_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    query: text('query').notNull(),
    params: jsonb('params').notNull().default('{}'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    appUserId: uuid('app_user_id'),
    userDeletedAt: timestamp('user_deleted_at', { precision: 3 }),
    mediaCount: integer('media_count').notNull().default(0),
    transcriptCount: integer('transcript_count').notNull().default(0),
    channelCount: integer('channel_count').notNull().default(0),
  },
  (SearchLogEntry) => ({
    search_log_entry_appUser_fkey: foreignKey({
      name: 'search_log_entry_appUser_fkey',
      columns: [SearchLogEntry.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    search_log_entry_app_user_id_user_deleted_at_created_at_idx: index(
      'search_log_entry_app_user_id_user_deleted_at_created_at_idx',
    ).on(
      SearchLogEntry.appUserId,
      SearchLogEntry.userDeletedAt,
      SearchLogEntry.createdAt.desc().nullsFirst(),
    ),
    search_log_entry_created_at_idx: index(
      'search_log_entry_created_at_idx',
    ).on(SearchLogEntry.createdAt.desc().nullsFirst()),
  }),
);

export const SavedMedia = pgTable(
  'saved_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appUserId: uuid('app_user_id').notNull(),
    uploadRecordId: uuid('upload_record_id').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (SavedMedia) => ({
    saved_media_appUser_fkey: foreignKey({
      name: 'saved_media_appUser_fkey',
      columns: [SavedMedia.appUserId],
      foreignColumns: [AppUser.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    saved_media_uploadRecord_fkey: foreignKey({
      name: 'saved_media_uploadRecord_fkey',
      columns: [SavedMedia.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    SavedMedia_appUserId_uploadRecordId_unique_idx: uniqueIndex(
      'SavedMedia_appUserId_uploadRecordId_key',
    ).on(SavedMedia.appUserId, SavedMedia.uploadRecordId),
    saved_media_app_user_id_created_at_idx: index(
      'saved_media_app_user_id_created_at_idx',
    ).on(SavedMedia.appUserId, SavedMedia.createdAt),
  }),
);

export const FeaturedUpload = pgTable(
  'featured_upload',
  {
    uploadRecordId: uuid('upload_record_id').notNull().primaryKey(),
    rank: integer('rank').notNull(),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (FeaturedUpload) => ({
    featured_upload_uploadRecord_fkey: foreignKey({
      name: 'featured_upload_uploadRecord_fkey',
      columns: [FeaturedUpload.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    FeaturedUpload_cpk: primaryKey({
      name: 'FeaturedUpload_cpk',
      columns: [FeaturedUpload.uploadRecordId],
    }),
    featured_upload_rank_idx: index('featured_upload_rank_idx').on(
      FeaturedUpload.rank,
    ),
  }),
);

// Global, site-wide configuration. This is a singleton table: at most one row
// (enforced by a CHECK that pins the primary key to 1). Read it via the cached
// helper in the web app (`util/maintenance`) rather than querying on every
// request.
export const SiteConfig = pgTable(
  'site_config',
  {
    id: integer('id').notNull().primaryKey().default(1),
    maintenanceMode: boolean('maintenance_mode').notNull().default(false),
    maintenanceMessage: text('maintenance_message'),
    updatedById: uuid('updated_by_id'),
    updatedAt: timestamp('updated_at', { precision: 3 }).notNull().defaultNow(),
  },
  (SiteConfig) => ({
    site_config_singleton: check(
      'site_config_singleton',
      sql`${SiteConfig.id} = 1`,
    ),
  }),
);

export const NewsletterMailingList = pgTable('newsletter_mailing_list', {
  listmonkUuid: uuid('listmonk_uuid').notNull().primaryKey(),
  name: text('name').notNull(),
  type: NewsletterListType('type').notNull().default('public'),
  optin: NewsletterListOptin('optin').notNull().default('single'),
  enabled: boolean('enabled').notNull().default(true),
  subscribeOnRegistration: boolean('subscribe_on_registration')
    .notNull()
    .default(false),
  createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3 })
    .notNull()
    .$onUpdate(() => new Date()),
});

export const ChannelImportSource = pgTable(
  'channel_import_source',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id').notNull(),
    url: text('url').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    cronSchedule: text('cron_schedule').notNull().default('0 1 * * *'),
    timezone: text('timezone').notNull().default('America/New_York'),
    lastImportedAt: timestamp('last_imported_at', { precision: 3 }),
    lastSuccessfulImportAt: timestamp('last_successful_import_at', {
      precision: 3,
    }),
    lastErrorAt: timestamp('last_error_at', { precision: 3 }),
    lastErrorMessage: text('last_error_message'),
    earliestImportDate: timestamp('earliest_import_date', { precision: 3 }),
    lastImportedUploadDate: timestamp('last_imported_upload_date', {
      precision: 3,
    }),
    deduplicationEnabled: boolean('deduplication_enabled')
      .notNull()
      .default(false),
    deduplicationFields: jsonb('deduplication_fields'),
    workflowId: varchar('workflow_id', { length: 255 }),
    workflowStatus: ChannelImportSourceWorkflowStatus('workflow_status')
      .notNull()
      .default('NOT_STARTED'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
    createdById: uuid('created_by_id'),
    updatedAt: timestamp('updated_at', { precision: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
    updatedById: uuid('updated_by_id'),
  },
  (ChannelImportSource) => ({
    channel_import_source_channel_fkey: foreignKey({
      name: 'channel_import_source_channel_fkey',
      columns: [ChannelImportSource.channelId],
      foreignColumns: [Channel.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    channel_import_source_createdBy_fkey: foreignKey({
      name: 'channel_import_source_createdBy_fkey',
      columns: [ChannelImportSource.createdById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    channel_import_source_updatedBy_fkey: foreignKey({
      name: 'channel_import_source_updatedBy_fkey',
      columns: [ChannelImportSource.updatedById],
      foreignColumns: [AppUser.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    channel_import_source_channel_id_idx: index(
      'channel_import_source_channel_id_idx',
    ).on(ChannelImportSource.channelId),
    channel_import_source_enabled_idx: index(
      'channel_import_source_enabled_idx',
    ).on(ChannelImportSource.enabled),
    channel_import_source_workflow_status_idx: index(
      'channel_import_source_workflow_status_idx',
    ).on(ChannelImportSource.workflowStatus),
  }),
);

export const ChannelImportRun = pgTable(
  'channel_import_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importSourceId: uuid('import_source_id').notNull(),
    startedAt: timestamp('started_at', { precision: 3 }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { precision: 3 }),
    status: ChannelImportRunStatus('status').notNull(),
    itemsFound: integer('items_found').notNull().default(0),
    itemsImported: integer('items_imported').notNull().default(0),
    itemsSkipped: integer('items_skipped').notNull().default(0),
    itemsFailed: integer('items_failed').notNull().default(0),
    errorMessage: text('error_message'),
    errorDetails: jsonb('error_details'),
  },
  (ChannelImportRun) => ({
    channel_import_run_importSource_fkey: foreignKey({
      name: 'channel_import_run_importSource_fkey',
      columns: [ChannelImportRun.importSourceId],
      foreignColumns: [ChannelImportSource.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    channel_import_run_import_source_id_started_at_idx: index(
      'channel_import_run_import_source_id_started_at_idx',
    ).on(ChannelImportRun.importSourceId, ChannelImportRun.startedAt),
    channel_import_run_status_idx: index('channel_import_run_status_idx').on(
      ChannelImportRun.status,
    ),
  }),
);

export const ImportHistory = pgTable(
  'import_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importSourceId: uuid('import_source_id').notNull(),
    uploadRecordId: uuid('upload_record_id'),
    title: text('title').notNull(),
    description: text('description'),
    url: text('url'),
    publishedAt: timestamp('published_at', { precision: 3 }).notNull(),
    source: text('source'),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (ImportHistory) => ({
    import_history_importSource_fkey: foreignKey({
      name: 'import_history_importSource_fkey',
      columns: [ImportHistory.importSourceId],
      foreignColumns: [ChannelImportSource.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    import_history_uploadRecord_fkey: foreignKey({
      name: 'import_history_uploadRecord_fkey',
      columns: [ImportHistory.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    import_history_import_source_id_published_at_idx: index(
      'import_history_import_source_id_published_at_idx',
    ).on(ImportHistory.importSourceId, ImportHistory.publishedAt),
    import_history_import_source_id_title_idx: index(
      'import_history_import_source_id_title_idx',
    ).on(ImportHistory.importSourceId, ImportHistory.title),
    import_history_import_source_id_url_idx: index(
      'import_history_import_source_id_url_idx',
    ).on(ImportHistory.importSourceId, ImportHistory.url),
  }),
);

export const AppUserRelations = relations(AppUser, ({ many }) => ({
  emails: many(AppUserEmail, {
    relationName: 'AppUserToAppUserEmail',
  }),
  donationDonors: many(DonationDonor, {
    relationName: 'AppUserToDonationDonor',
  }),
  sessions: many(AppSession, {
    relationName: 'AppSessionToAppUser',
  }),
  channelMemberships: many(ChannelMembership, {
    relationName: 'AppUserToChannelMembership',
  }),
  organizationMemberships: many(OrganizationMembership, {
    relationName: 'AppUserToOrganizationMembership',
  }),
  organizationInvitations: many(OrganizationInvitation, {
    relationName: 'invitedOrganizations',
  }),
  channelInvitations: many(ChannelInvitation, {
    relationName: 'invitedChannels',
  }),
  createdUploads: many(UploadRecord, {
    relationName: 'createdUploads',
  }),
  finalizedUploads: many(UploadRecord, {
    relationName: 'finalizedUploads',
  }),
  channelSubscriptions: many(ChannelSubscription, {
    relationName: 'AppUserToChannelSubscription',
  }),
  uploadUserComments: many(UploadUserComment, {
    relationName: 'AppUserToUploadUserComment',
  }),
  uploadUserRatings: many(UploadUserRating, {
    relationName: 'AppUserToUploadUserRating',
  }),
  uploadUserCommentRatings: many(UploadUserCommentRating, {
    relationName: 'AppUserToUploadUserCommentRating',
  }),
  uploadViews: many(UploadView, {
    relationName: 'AppUserToUploadView',
  }),
  uploadLists: many(UploadList, {
    relationName: 'AppUserToUploadList',
  }),
  savedMedia: many(SavedMedia, {
    relationName: 'AppUserToSavedMedia',
  }),
  approvedChannels: many(Channel, {
    relationName: 'AppUserToChannel',
  }),
  approvedOrganizations: many(Organization, {
    relationName: 'AppUserToOrganization',
  }),
  searches: many(SearchLogEntry, {
    relationName: 'AppUserToSearchLogEntry',
  }),
  uploadStates: many(UploadState, {
    relationName: 'AppUserToUploadState',
  }),
  createdImportSources: many(ChannelImportSource, {
    relationName: 'createdImportSources',
  }),
  updatedImportSources: many(ChannelImportSource, {
    relationName: 'updatedImportSources',
  }),
}));

export const AppUserEmailRelations = relations(AppUserEmail, ({ one }) => ({
  appUser: one(AppUser, {
    relationName: 'AppUserToAppUserEmail',
    fields: [AppUserEmail.appUserId],
    references: [AppUser.id],
  }),
}));

export const AppSessionRelations = relations(AppSession, ({ one }) => ({
  appUser: one(AppUser, {
    relationName: 'AppSessionToAppUser',
    fields: [AppSession.appUserId],
    references: [AppUser.id],
  }),
}));

export const DonationDonorRelations = relations(
  DonationDonor,
  ({ many, one }) => ({
    appUser: one(AppUser, {
      relationName: 'AppUserToDonationDonor',
      fields: [DonationDonor.appUserId],
      references: [AppUser.id],
    }),
    checkouts: many(DonationCheckout, {
      relationName: 'DonationDonorToDonationCheckout',
    }),
    subscriptions: many(DonationSubscription, {
      relationName: 'DonationDonorToDonationSubscription',
    }),
    donations: many(Donation, {
      relationName: 'DonationDonorToDonation',
    }),
  }),
);

export const DonationCheckoutRelations = relations(
  DonationCheckout,
  ({ many, one }) => ({
    donor: one(DonationDonor, {
      relationName: 'DonationDonorToDonationCheckout',
      fields: [DonationCheckout.donorId],
      references: [DonationDonor.id],
    }),
    subscriptions: many(DonationSubscription, {
      relationName: 'DonationCheckoutToDonationSubscription',
    }),
    donations: many(Donation, {
      relationName: 'DonationCheckoutToDonation',
    }),
  }),
);

export const DonationSubscriptionRelations = relations(
  DonationSubscription,
  ({ many, one }) => ({
    donor: one(DonationDonor, {
      relationName: 'DonationDonorToDonationSubscription',
      fields: [DonationSubscription.donorId],
      references: [DonationDonor.id],
    }),
    checkout: one(DonationCheckout, {
      relationName: 'DonationCheckoutToDonationSubscription',
      fields: [DonationSubscription.checkoutId],
      references: [DonationCheckout.id],
    }),
    donations: many(Donation, {
      relationName: 'DonationSubscriptionToDonation',
    }),
  }),
);

export const DonationRelations = relations(Donation, ({ one }) => ({
  donor: one(DonationDonor, {
    relationName: 'DonationDonorToDonation',
    fields: [Donation.donorId],
    references: [DonationDonor.id],
  }),
  checkout: one(DonationCheckout, {
    relationName: 'DonationCheckoutToDonation',
    fields: [Donation.checkoutId],
    references: [DonationCheckout.id],
  }),
  subscription: one(DonationSubscription, {
    relationName: 'DonationSubscriptionToDonation',
    fields: [Donation.subscriptionId],
    references: [DonationSubscription.id],
  }),
}));

export const OidcAuthorizationCodeRelations = relations(
  OidcAuthorizationCode,
  ({ one }) => ({
    appUser: one(AppUser, {
      relationName: 'AppUserToOidcAuthorizationCode',
      fields: [OidcAuthorizationCode.appUserId],
      references: [AppUser.id],
    }),
  }),
);

export const OidcRefreshTokenRelations = relations(
  OidcRefreshToken,
  ({ one }) => ({
    appUser: one(AppUser, {
      relationName: 'AppUserToOidcRefreshToken',
      fields: [OidcRefreshToken.appUserId],
      references: [AppUser.id],
    }),
  }),
);

export const ChannelSubscriptionRelations = relations(
  ChannelSubscription,
  ({ one }) => ({
    appUser: one(AppUser, {
      relationName: 'AppUserToChannelSubscription',
      fields: [ChannelSubscription.appUserId],
      references: [AppUser.id],
    }),
    channel: one(Channel, {
      relationName: 'ChannelToChannelSubscription',
      fields: [ChannelSubscription.channelId],
      references: [Channel.id],
    }),
  }),
);

export const OrganizationTagRelations = relations(
  OrganizationTag,
  ({ many }) => ({
    organizations: many(OrganizationTagInstance, {
      relationName: 'OrganizationTagToOrganizationTagInstance',
    }),
    suggestedBy: many(OrganizationTagSuggestion, {
      relationName: 'SuggestedBy',
    }),
    suggests: many(OrganizationTagSuggestion, {
      relationName: 'Suggests',
    }),
  }),
);

export const OrganizationTagSuggestionRelations = relations(
  OrganizationTagSuggestion,
  ({ one }) => ({
    parent: one(OrganizationTag, {
      relationName: 'SuggestedBy',
      fields: [OrganizationTagSuggestion.parentSlug],
      references: [OrganizationTag.slug],
    }),
    suggested: one(OrganizationTag, {
      relationName: 'Suggests',
      fields: [OrganizationTagSuggestion.suggestedSlug],
      references: [OrganizationTag.slug],
    }),
  }),
);

export const OrganizationTagInstanceRelations = relations(
  OrganizationTagInstance,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationTagInstance',
      fields: [OrganizationTagInstance.organizationId],
      references: [Organization.id],
    }),
    tag: one(OrganizationTag, {
      relationName: 'OrganizationTagToOrganizationTagInstance',
      fields: [OrganizationTagInstance.tagSlug],
      references: [OrganizationTag.slug],
    }),
  }),
);

export const OrganizationRelations = relations(
  Organization,
  ({ many, one }) => ({
    addresses: many(OrganizationAddress, {
      relationName: 'OrganizationToOrganizationAddress',
    }),
    leaders: many(OrganizationLeader, {
      relationName: 'OrganizationToOrganizationLeader',
    }),
    memberships: many(OrganizationMembership, {
      relationName: 'OrganizationToOrganizationMembership',
    }),
    invitations: many(OrganizationInvitation, {
      relationName: 'OrganizationToOrganizationInvitation',
    }),
    channelAssociations: many(OrganizationChannelAssociation, {
      relationName: 'OrganizationToOrganizationChannelAssociation',
    }),
    upstreamOrganizationAssociations: many(
      OrganizationOrganizationAssociation,
      {
        relationName: 'downstreamOrganization',
      },
    ),
    downstreamOrganizationAssociations: many(
      OrganizationOrganizationAssociation,
      {
        relationName: 'upstreamOrganization',
      },
    ),
    tags: many(OrganizationTagInstance, {
      relationName: 'OrganizationToOrganizationTagInstance',
    }),
    approvedBy: one(AppUser, {
      relationName: 'AppUserToOrganization',
      fields: [Organization.approvedById],
      references: [AppUser.id],
    }),
    uploadStates: many(UploadState, {
      relationName: 'OrganizationToUploadState',
    }),
  }),
);

export const OrganizationAddressRelations = relations(
  OrganizationAddress,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationAddress',
      fields: [OrganizationAddress.organizationId],
      references: [Organization.id],
    }),
  }),
);

export const OrganizationLeaderRelations = relations(
  OrganizationLeader,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationLeader',
      fields: [OrganizationLeader.organizationId],
      references: [Organization.id],
    }),
  }),
);

export const OrganizationMembershipRelations = relations(
  OrganizationMembership,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationMembership',
      fields: [OrganizationMembership.organizationId],
      references: [Organization.id],
    }),
    appUser: one(AppUser, {
      relationName: 'AppUserToOrganizationMembership',
      fields: [OrganizationMembership.appUserId],
      references: [AppUser.id],
    }),
  }),
);

export const OrganizationInvitationRelations = relations(
  OrganizationInvitation,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationInvitation',
      fields: [OrganizationInvitation.organizationId],
      references: [Organization.id],
    }),
    invitedBy: one(AppUser, {
      relationName: 'invitedOrganizations',
      fields: [OrganizationInvitation.invitedById],
      references: [AppUser.id],
    }),
  }),
);

export const OrganizationOrganizationAssociationRelations = relations(
  OrganizationOrganizationAssociation,
  ({ one }) => ({
    upstreamOrganization: one(Organization, {
      relationName: 'upstreamOrganization',
      fields: [OrganizationOrganizationAssociation.upstreamOrganizationId],
      references: [Organization.id],
    }),
    downstreamOrganization: one(Organization, {
      relationName: 'downstreamOrganization',
      fields: [OrganizationOrganizationAssociation.downstreamOrganizationId],
      references: [Organization.id],
    }),
  }),
);

export const OrganizationChannelAssociationRelations = relations(
  OrganizationChannelAssociation,
  ({ one }) => ({
    organization: one(Organization, {
      relationName: 'OrganizationToOrganizationChannelAssociation',
      fields: [OrganizationChannelAssociation.organizationId],
      references: [Organization.id],
    }),
    channel: one(Channel, {
      relationName: 'ChannelToOrganizationChannelAssociation',
      fields: [OrganizationChannelAssociation.channelId],
      references: [Channel.id],
    }),
  }),
);

export const ChannelRelations = relations(Channel, ({ many, one }) => ({
  memberships: many(ChannelMembership, {
    relationName: 'ChannelToChannelMembership',
  }),
  invitations: many(ChannelInvitation, {
    relationName: 'ChannelToChannelInvitation',
  }),
  organizationAssociations: many(OrganizationChannelAssociation, {
    relationName: 'ChannelToOrganizationChannelAssociation',
  }),
  approvedBy: one(AppUser, {
    relationName: 'AppUserToChannel',
    fields: [Channel.approvedById],
    references: [AppUser.id],
  }),
  uploadRecords: many(UploadRecord, {
    relationName: 'ChannelToUploadRecord',
  }),
  uploadLists: many(UploadList, {
    relationName: 'ChannelToUploadList',
  }),
  subscribers: many(ChannelSubscription, {
    relationName: 'ChannelToChannelSubscription',
  }),
  uploadStates: many(UploadState, {
    relationName: 'ChannelToUploadState',
  }),
  importSources: many(ChannelImportSource, {
    relationName: 'ChannelToChannelImportSource',
  }),
  speakers: many(Speaker, {
    relationName: 'ChannelToSpeaker',
  }),
  speakerLinkRequests: many(SpeakerLink, {
    relationName: 'ChannelToSpeakerLink',
  }),
  liveStream: one(ChannelLiveStream, {
    relationName: 'ChannelToChannelLiveStream',
    fields: [Channel.id],
    references: [ChannelLiveStream.channelId],
  }),
}));

export const ChannelLiveStreamRelations = relations(
  ChannelLiveStream,
  ({ one, many }) => ({
    channel: one(Channel, {
      relationName: 'ChannelToChannelLiveStream',
      fields: [ChannelLiveStream.channelId],
      references: [Channel.id],
    }),
    createdBy: one(AppUser, {
      relationName: 'AppUserToChannelLiveStream',
      fields: [ChannelLiveStream.createdById],
      references: [AppUser.id],
    }),
    simulcastTargets: many(ChannelSimulcastTarget, {
      relationName: 'ChannelLiveStreamToChannelSimulcastTarget',
    }),
  }),
);

export const ChannelSimulcastTargetRelations = relations(
  ChannelSimulcastTarget,
  ({ one }) => ({
    liveStream: one(ChannelLiveStream, {
      relationName: 'ChannelLiveStreamToChannelSimulcastTarget',
      fields: [ChannelSimulcastTarget.channelLiveStreamId],
      references: [ChannelLiveStream.id],
    }),
  }),
);

export const ChannelMembershipRelations = relations(
  ChannelMembership,
  ({ one }) => ({
    channel: one(Channel, {
      relationName: 'ChannelToChannelMembership',
      fields: [ChannelMembership.channelId],
      references: [Channel.id],
    }),
    appUser: one(AppUser, {
      relationName: 'AppUserToChannelMembership',
      fields: [ChannelMembership.appUserId],
      references: [AppUser.id],
    }),
  }),
);

export const ChannelInvitationRelations = relations(
  ChannelInvitation,
  ({ one }) => ({
    channel: one(Channel, {
      relationName: 'ChannelToChannelInvitation',
      fields: [ChannelInvitation.channelId],
      references: [Channel.id],
    }),
    invitedBy: one(AppUser, {
      relationName: 'invitedChannels',
      fields: [ChannelInvitation.invitedById],
      references: [AppUser.id],
    }),
  }),
);

export const SpeakerRelations = relations(Speaker, ({ many, one }) => ({
  channel: one(Channel, {
    relationName: 'ChannelToSpeaker',
    fields: [Speaker.channelId],
    references: [Channel.id],
  }),
  createdBy: one(AppUser, {
    relationName: 'AppUserToSpeaker',
    fields: [Speaker.createdById],
    references: [AppUser.id],
  }),
  attributions: many(SpeakerAttribution, {
    relationName: 'SpeakerToSpeakerAttribution',
  }),
  links: many(SpeakerLink, {
    relationName: 'SpeakerToSpeakerLink',
  }),
}));

export const SpeakerAttributionRelations = relations(
  SpeakerAttribution,
  ({ one }) => ({
    uploadRecord: one(UploadRecord, {
      relationName: 'UploadRecordToSpeakerAttribution',
      fields: [SpeakerAttribution.uploadRecordId],
      references: [UploadRecord.id],
    }),
    speaker: one(Speaker, {
      relationName: 'SpeakerToSpeakerAttribution',
      fields: [SpeakerAttribution.speakerId],
      references: [Speaker.id],
    }),
  }),
);

export const SpeakerLinkRelations = relations(SpeakerLink, ({ one }) => ({
  speaker: one(Speaker, {
    relationName: 'SpeakerToSpeakerLink',
    fields: [SpeakerLink.speakerId],
    references: [Speaker.id],
  }),
  requestingChannel: one(Channel, {
    relationName: 'ChannelToSpeakerLink',
    fields: [SpeakerLink.requestingChannelId],
    references: [Channel.id],
  }),
}));

export const UploadStateRelations = relations(UploadState, ({ one }) => ({
  uploadRecord: one(UploadRecord, {
    relationName: 'UploadRecordToUploadState',
    fields: [UploadState.uploadRecordId],
    references: [UploadRecord.id],
  }),
  appUser: one(AppUser, {
    relationName: 'AppUserToUploadState',
    fields: [UploadState.appUserId],
    references: [AppUser.id],
  }),
  channel: one(Channel, {
    relationName: 'ChannelToUploadState',
    fields: [UploadState.channelId],
    references: [Channel.id],
  }),
  organization: one(Organization, {
    relationName: 'OrganizationToUploadState',
    fields: [UploadState.organizationId],
    references: [Organization.id],
  }),
}));

export const UploadRecordRelations = relations(
  UploadRecord,
  ({ one, many }) => ({
    createdBy: one(AppUser, {
      relationName: 'createdUploads',
      fields: [UploadRecord.appUserId],
      references: [AppUser.id],
    }),
    channel: one(Channel, {
      relationName: 'ChannelToUploadRecord',
      fields: [UploadRecord.channelId],
      references: [Channel.id],
    }),
    uploadFinalizedBy: one(AppUser, {
      relationName: 'finalizedUploads',
      fields: [UploadRecord.uploadFinalizedById],
      references: [AppUser.id],
    }),
    userRatings: many(UploadUserRating, {
      relationName: 'UploadRecordToUploadUserRating',
    }),
    userComments: many(UploadUserComment, {
      relationName: 'UploadRecordToUploadUserComment',
    }),
    uploadViews: many(UploadView, {
      relationName: 'UploadRecordToUploadView',
    }),
    uploadListEntries: many(UploadListEntry, {
      relationName: 'UploadListEntryToUploadRecord',
    }),
    savedByUsers: many(SavedMedia, {
      relationName: 'SavedMediaToUploadRecord',
    }),
    featuredUpload: one(FeaturedUpload),
    uploadStates: many(UploadState, {
      relationName: 'UploadRecordToUploadState',
    }),
    importHistory: many(ImportHistory, {
      relationName: 'ImportHistoryToUploadRecord',
    }),
  }),
);

export const UploadUserRatingRelations = relations(
  UploadUserRating,
  ({ one }) => ({
    appUser: one(AppUser, {
      relationName: 'AppUserToUploadUserRating',
      fields: [UploadUserRating.appUserId],
      references: [AppUser.id],
    }),
    uploadRecord: one(UploadRecord, {
      relationName: 'UploadRecordToUploadUserRating',
      fields: [UploadUserRating.uploadRecordId],
      references: [UploadRecord.id],
    }),
  }),
);

export const UploadUserCommentRelations = relations(
  UploadUserComment,
  ({ one, many }) => ({
    author: one(AppUser, {
      relationName: 'AppUserToUploadUserComment',
      fields: [UploadUserComment.authorId],
      references: [AppUser.id],
    }),
    upload: one(UploadRecord, {
      relationName: 'UploadRecordToUploadUserComment',
      fields: [UploadUserComment.uploadRecordId],
      references: [UploadRecord.id],
    }),
    replies: many(UploadUserComment, {
      relationName: 'ThreadComments',
    }),
    replyingTo: one(UploadUserComment, {
      relationName: 'ThreadComments',
      fields: [UploadUserComment.replyingToId],
      references: [UploadUserComment.id],
    }),
    userRatings: many(UploadUserCommentRating, {
      relationName: 'UploadUserCommentToUploadUserCommentRating',
    }),
  }),
);

export const UploadUserCommentRatingRelations = relations(
  UploadUserCommentRating,
  ({ one }) => ({
    appUser: one(AppUser, {
      relationName: 'AppUserToUploadUserCommentRating',
      fields: [UploadUserCommentRating.appUserId],
      references: [AppUser.id],
    }),
    uploadUserComment: one(UploadUserComment, {
      relationName: 'UploadUserCommentToUploadUserCommentRating',
      fields: [UploadUserCommentRating.uploadUserCommentId],
      references: [UploadUserComment.id],
    }),
  }),
);

export const UploadViewRelations = relations(UploadView, ({ one, many }) => ({
  upload: one(UploadRecord, {
    relationName: 'UploadRecordToUploadView',
    fields: [UploadView.uploadRecordId],
    references: [UploadRecord.id],
  }),
  user: one(AppUser, {
    relationName: 'AppUserToUploadView',
    fields: [UploadView.appUserId],
    references: [AppUser.id],
  }),
  UploadViewSecond: many(UploadViewSecond, {
    relationName: 'UploadViewToUploadViewSecond',
  }),
}));

export const UploadViewSecondRelations = relations(
  UploadViewSecond,
  ({ one }) => ({
    view: one(UploadView, {
      relationName: 'UploadViewToUploadViewSecond',
      fields: [UploadViewSecond.uploadRecordId, UploadViewSecond.viewHash],
      references: [UploadView.uploadRecordId, UploadView.viewHash],
    }),
  }),
);

export const UploadListEntryRelations = relations(
  UploadListEntry,
  ({ one }) => ({
    uploadList: one(UploadList, {
      relationName: 'UploadListToUploadListEntry',
      fields: [UploadListEntry.uploadListId],
      references: [UploadList.id],
    }),
    upload: one(UploadRecord, {
      relationName: 'UploadListEntryToUploadRecord',
      fields: [UploadListEntry.uploadRecordId],
      references: [UploadRecord.id],
    }),
  }),
);

export const UploadListRelations = relations(UploadList, ({ one, many }) => ({
  author: one(AppUser, {
    relationName: 'AppUserToUploadList',
    fields: [UploadList.authorId],
    references: [AppUser.id],
  }),
  channel: one(Channel, {
    relationName: 'ChannelToUploadList',
    fields: [UploadList.channelId],
    references: [Channel.id],
  }),
  uploads: many(UploadListEntry, {
    relationName: 'UploadListToUploadListEntry',
  }),
}));

export const SearchLogEntryRelations = relations(SearchLogEntry, ({ one }) => ({
  appUser: one(AppUser, {
    relationName: 'AppUserToSearchLogEntry',
    fields: [SearchLogEntry.appUserId],
    references: [AppUser.id],
  }),
}));

export const SavedMediaRelations = relations(SavedMedia, ({ one }) => ({
  appUser: one(AppUser, {
    relationName: 'AppUserToSavedMedia',
    fields: [SavedMedia.appUserId],
    references: [AppUser.id],
  }),
  uploadRecord: one(UploadRecord, {
    relationName: 'SavedMediaToUploadRecord',
    fields: [SavedMedia.uploadRecordId],
    references: [UploadRecord.id],
  }),
}));

export const FeaturedUploadRelations = relations(FeaturedUpload, ({ one }) => ({
  uploadRecord: one(UploadRecord, {
    relationName: 'FeaturedUploadToUploadRecord',
    fields: [FeaturedUpload.uploadRecordId],
    references: [UploadRecord.id],
  }),
}));

export const ChannelImportSourceRelations = relations(
  ChannelImportSource,
  ({ one, many }) => ({
    channel: one(Channel, {
      relationName: 'ChannelToChannelImportSource',
      fields: [ChannelImportSource.channelId],
      references: [Channel.id],
    }),
    createdBy: one(AppUser, {
      relationName: 'createdImportSources',
      fields: [ChannelImportSource.createdById],
      references: [AppUser.id],
    }),
    updatedBy: one(AppUser, {
      relationName: 'updatedImportSources',
      fields: [ChannelImportSource.updatedById],
      references: [AppUser.id],
    }),
    importRuns: many(ChannelImportRun, {
      relationName: 'ChannelImportRunToChannelImportSource',
    }),
    importHistory: many(ImportHistory, {
      relationName: 'ChannelImportSourceToImportHistory',
    }),
  }),
);

export const ChannelImportRunRelations = relations(
  ChannelImportRun,
  ({ one }) => ({
    importSource: one(ChannelImportSource, {
      relationName: 'ChannelImportRunToChannelImportSource',
      fields: [ChannelImportRun.importSourceId],
      references: [ChannelImportSource.id],
    }),
  }),
);

export const ImportHistoryRelations = relations(ImportHistory, ({ one }) => ({
  importSource: one(ChannelImportSource, {
    relationName: 'ChannelImportSourceToImportHistory',
    fields: [ImportHistory.importSourceId],
    references: [ChannelImportSource.id],
  }),
  uploadRecord: one(UploadRecord, {
    relationName: 'ImportHistoryToUploadRecord',
    fields: [ImportHistory.uploadRecordId],
    references: [UploadRecord.id],
  }),
}));

// Audit log of every chat-completion call we make to an upstream LLM
// (annotation, summarization, and the admin LLM-eval surface). One row
// per call, recorded right after the completion comes back — including
// calls that subsequently fail downstream guards (silent-summarization,
// content-filter), since we paid for those tokens too.
//
// `computedCostUsd` is calculated on our side from `MODEL_PRICING` at
// the time of the call (see `packages/temporal/src/util/llm-pricing.ts`).
// `providerCostUsd` is what OpenRouter returned in `usage.cost` when
// available — kept for reconciliation against our table. The two can
// diverge when the price table is stale or when OpenRouter routes to a
// provider whose price we haven't catalogued; alert when the deltas
// exceed a threshold.
export const LlmCall = pgTable(
  'llm_call',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // OpenRouter model id, e.g. 'openai/gpt-5.6-luna'. Stored verbatim
    // because pricing windows are keyed on this exact string.
    model: text('model').notNull(),
    // Logical activity tag — 'annotateTranscript', 'summarizeUpload',
    // 'evalAnnotate', etc. Free-form so new activities don't need a
    // schema migration.
    activity: text('activity').notNull(),
    // Nullable: the admin LLM-eval surface and other non-upload-bound
    // flows have no upload. SET NULL on delete so an upload deletion
    // doesn't shred its cost history (we still want the spend record).
    uploadRecordId: uuid('upload_record_id'),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    // Provider-reported cached-input token count when available
    // (Anthropic prompt caching, OpenAI cache_hits). Null when the
    // provider doesn't expose it — most routes don't today.
    cachedTokens: integer('cached_tokens'),
    // Our-table-computed cost. Numeric (not double) because we're
    // accumulating fractions-of-a-cent values that need to sum exactly.
    computedCostUsd: numeric('computed_cost_usd', {
      precision: 18,
      scale: 8,
    }),
    // OpenRouter's reported usage.cost (when set on the request and
    // returned non-null). Kept for reconciliation against our pricing
    // table.
    providerCostUsd: numeric('provider_cost_usd', {
      precision: 18,
      scale: 8,
    }),
    durationMs: integer('duration_ms').notNull(),
    // The model's finish_reason — 'stop' on success, or 'length' /
    // 'content_filter' on the failure paths that the downstream guards
    // also catch. Null when the provider didn't return one.
    finishReason: text('finish_reason'),
    // Caller-supplied disposition tag. 'success' on the happy path,
    // 'guard_*' values when one of the activity's downstream guards
    // rejected the response (silent_summarization, length_truncation,
    // content_filter, empty_content), or 'create_failed' when
    // `llm.chat.completions.create` itself threw. Distinct from
    // `finish_reason` because a silent-summarization rejection still
    // has `finish_reason='stop'` — the model "successfully" returned a
    // summary we then threw out. Free-form so new guards don't need a
    // migration; defaults to 'success' so "all calls" dashboards never
    // miss a row.
    outcome: text('outcome').notNull().default('success'),
    // Free-form failure detail when `outcome` is a guard rejection
    // (mirrors the thrown Error's message). Null on success.
    errorMessage: text('error_message'),
    // The model's full, verbatim response text — `choices[0].message.content`
    // for chat completions, captured on both the live and batch paths. This
    // is the only place the complete raw completion is retained: the
    // activities parse it down to structured rows (annotations, summary
    // sections) and discard the rest, so keep it here for re-parsing after a
    // parser change, debugging skipped spans, and audit. Null for embeddings
    // (the response is a vector, not text), for `create_failed` /
    // `batch_request_failed` rows (no response body), and for content-filter
    // rejections (the provider returns no content). Can be large; it's a
    // plain `text` column with no index — query by joining on the other
    // indexed columns (upload, activity, created_at), never by scanning this.
    responseText: text('response_text'),
    // True when the call was processed via OpenAI's Batch API rather
    // than the live (OpenRouter) path — Batch invoices at 50% of the
    // posted rate, so `computedCostUsd` for these rows is already
    // halved before insert. Lets cost dashboards split live vs batch
    // spend without inferring it.
    viaBatch: boolean('via_batch').notNull().default(false),
    createdAt: timestamp('created_at', { precision: 3 }).notNull().defaultNow(),
  },
  (LlmCall) => ({
    llm_call_uploadRecord_fkey: foreignKey({
      name: 'llm_call_uploadRecord_fkey',
      columns: [LlmCall.uploadRecordId],
      foreignColumns: [UploadRecord.id],
    })
      .onDelete('set null')
      .onUpdate('cascade'),
    llm_call_created_at_idx: index('llm_call_created_at_idx').on(
      LlmCall.createdAt,
    ),
    llm_call_model_created_at_idx: index('llm_call_model_created_at_idx').on(
      LlmCall.model,
      LlmCall.createdAt,
    ),
    llm_call_activity_created_at_idx: index(
      'llm_call_activity_created_at_idx',
    ).on(LlmCall.activity, LlmCall.createdAt),
    // Per-upload cost drill-down: "all spend for upload X" without a
    // seqscan as the table grows.
    llm_call_upload_record_id_idx: index('llm_call_upload_record_id_idx').on(
      LlmCall.uploadRecordId,
    ),
    // Failure-mode aggregation: "last N hours of guard-rejected calls",
    // used while tuning the silent-summarization floor.
    llm_call_outcome_created_at_idx: index(
      'llm_call_outcome_created_at_idx',
    ).on(LlmCall.outcome, LlmCall.createdAt),
  }),
);
