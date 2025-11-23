-- CreateEnum
CREATE TYPE "newsletter_list_type" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "newsletter_list_optin" AS ENUM ('single', 'double');

-- CreateTable
CREATE TABLE "newsletter_mailing_list" (
    "listmonk_uuid" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "newsletter_list_type" NOT NULL DEFAULT 'public',
    "optin" "newsletter_list_optin" NOT NULL DEFAULT 'single',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "subscribe_on_registration" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_mailing_list_pkey" PRIMARY KEY ("listmonk_uuid")
);
