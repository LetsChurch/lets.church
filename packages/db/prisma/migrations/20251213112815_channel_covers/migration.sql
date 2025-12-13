-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "upload_state_type" ADD VALUE 'CHANNEL_COVER';
ALTER TYPE "upload_state_type" ADD VALUE 'ORGANIZATION_COVER';

-- AlterTable
ALTER TABLE "channel" ADD COLUMN     "cover_blurhash" VARCHAR(255),
ADD COLUMN     "cover_path" VARCHAR(255);
