-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "channel_membership" ALTER COLUMN "can_upload" SET DEFAULT true;

-- CreateTable
CREATE TABLE "organization_invitation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "token" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "invited_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "organization_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_invitation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "token" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,
    "can_upload" BOOLEAN NOT NULL DEFAULT true,
    "can_download" BOOLEAN NOT NULL DEFAULT false,
    "invited_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "channel_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitation_token_key" ON "organization_invitation"("token");

-- CreateIndex
CREATE INDEX "organization_invitation_email_idx" ON "organization_invitation"("email");

-- CreateIndex
CREATE INDEX "organization_invitation_status_expires_at_idx" ON "organization_invitation"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitation_organization_id_email_key" ON "organization_invitation"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "channel_invitation_token_key" ON "channel_invitation"("token");

-- CreateIndex
CREATE INDEX "channel_invitation_email_idx" ON "channel_invitation"("email");

-- CreateIndex
CREATE INDEX "channel_invitation_status_expires_at_idx" ON "channel_invitation"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "channel_invitation_channel_id_email_key" ON "channel_invitation"("channel_id", "email");

-- AddForeignKey
ALTER TABLE "organization_invitation" ADD CONSTRAINT "organization_invitation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitation" ADD CONSTRAINT "organization_invitation_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_invitation" ADD CONSTRAINT "channel_invitation_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_invitation" ADD CONSTRAINT "channel_invitation_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
