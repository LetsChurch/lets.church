-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "app_user_role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UploadLicense" AS ENUM ('STANDARD', 'PUBLIC_DOMAIN', 'CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'CC_BY_NC_SA', 'CC_BY_ND', 'CC_BY_NC_ND', 'CC0');

-- CreateEnum
CREATE TYPE "UploadVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'UNLISTED');

-- CreateEnum
CREATE TYPE "UploadVariant" AS ENUM ('VIDEO_4K', 'VIDEO_1080P', 'VIDEO_720P', 'VIDEO_480P', 'VIDEO_360P', 'AUDIO');

-- CreateEnum
CREATE TYPE "Rating" AS ENUM ('LIKE', 'DISLIKE');

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" CITEXT NOT NULL,
    "password" TEXT NOT NULL,
    "full_name" VARCHAR(100),
    "avatar_path" VARCHAR(255),
    "avatar_blurhash" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "role" "app_user_role" NOT NULL DEFAULT 'USER',

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_email" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "app_user_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "app_user_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "app_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL DEFAULT (now() + '14 days'::interval),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "app_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_subscription" (
    "app_user_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,

    CONSTRAINT "channel_subscription_pkey" PRIMARY KEY ("app_user_id","channel_id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" CITEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_membership" (
    "channel_id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_membership_pkey" PRIMARY KEY ("channel_id","app_user_id")
);

-- CreateTable
CREATE TABLE "organization_channel_association" (
    "organization_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_channel_association_pkey" PRIMARY KEY ("organization_id","channel_id")
);

-- CreateTable
CREATE TABLE "channel" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "avatar_path" VARCHAR(255),
    "avatar_blurhash" VARCHAR(255),
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_membership" (
    "channel_id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "can_upload" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_membership_pkey" PRIMARY KEY ("channel_id","app_user_id")
);

-- CreateTable
CREATE TABLE "upload_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT,
    "description" TEXT,
    "app_user_id" UUID NOT NULL,
    "license" "UploadLicense" NOT NULL,
    "channel_id" UUID NOT NULL,
    "visibility" "UploadVisibility" NOT NULL,
    "upload_size_bytes" BIGINT,
    "upload_finalized" BOOLEAN NOT NULL DEFAULT false,
    "upload_finalized_by_id" UUID,
    "default_thumbnail_path" TEXT,
    "thumbnail_blurhash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcodingStartedAt" TIMESTAMP(3),
    "transcodingFinishedAt" TIMESTAMP(3),
    "transcodingProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transcribingStartedAt" TIMESTAMP(3),
    "transcribingFinishedAt" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "variants" "UploadVariant"[],
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score_stale_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_user_rating" (
    "app_user_id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "rating" "Rating" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_user_rating_pkey" PRIMARY KEY ("app_user_id","upload_id")
);

-- CreateTable
CREATE TABLE "upload_user_comment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "author_id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "replying_to_id" UUID,
    "text" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score_stale_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_user_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_user_comment_rating" (
    "app_user_id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "rating" "Rating" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_user_comment_rating_pkey" PRIMARY KEY ("app_user_id","upload_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_email_key" ON "app_user_email"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "channel_slug_key" ON "channel"("slug");

-- CreateIndex
CREATE INDEX "upload_record_created_at_id_idx" ON "upload_record"("created_at", "id");

-- CreateIndex
CREATE INDEX "upload_record_score_idx" ON "upload_record"("score");

-- CreateIndex
CREATE INDEX "upload_record_score_stale_at_idx" ON "upload_record"("score_stale_at");

-- CreateIndex
CREATE INDEX "upload_user_rating_upload_id_rating_idx" ON "upload_user_rating"("upload_id", "rating");

-- CreateIndex
CREATE INDEX "upload_user_rating_app_user_id_rating_idx" ON "upload_user_rating"("app_user_id", "rating");

-- CreateIndex
CREATE INDEX "upload_user_comment_replying_to_id_idx" ON "upload_user_comment"("replying_to_id");

-- CreateIndex
CREATE INDEX "upload_user_comment_score_idx" ON "upload_user_comment"("score");

-- CreateIndex
CREATE INDEX "upload_user_comment_score_stale_at_idx" ON "upload_user_comment"("score_stale_at");

-- CreateIndex
CREATE INDEX "upload_user_comment_rating_upload_id_rating_idx" ON "upload_user_comment_rating"("upload_id", "rating");

-- CreateIndex
CREATE INDEX "upload_user_comment_rating_app_user_id_rating_idx" ON "upload_user_comment_rating"("app_user_id", "rating");

-- AddForeignKey
ALTER TABLE "app_user_email" ADD CONSTRAINT "app_user_email_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_subscription" ADD CONSTRAINT "channel_subscription_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_subscription" ADD CONSTRAINT "channel_subscription_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_membership" ADD CONSTRAINT "organization_membership_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_channel_association" ADD CONSTRAINT "organization_channel_association_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_channel_association" ADD CONSTRAINT "organization_channel_association_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_membership" ADD CONSTRAINT "channel_membership_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_membership" ADD CONSTRAINT "channel_membership_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_upload_finalized_by_id_fkey" FOREIGN KEY ("upload_finalized_by_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_user_rating" ADD CONSTRAINT "upload_user_rating_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_user_rating" ADD CONSTRAINT "upload_user_rating_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "upload_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_user_comment" ADD CONSTRAINT "upload_user_comment_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_user_comment" ADD CONSTRAINT "upload_user_comment_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "upload_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_user_comment" ADD CONSTRAINT "upload_user_comment_replying_to_id_fkey" FOREIGN KEY ("replying_to_id") REFERENCES "upload_user_comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_user_comment_rating" ADD CONSTRAINT "upload_user_comment_rating_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_user_comment_rating" ADD CONSTRAINT "upload_user_comment_rating_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "upload_user_comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
