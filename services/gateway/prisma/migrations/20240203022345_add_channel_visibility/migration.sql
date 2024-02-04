-- CreateEnum
CREATE TYPE "channel_visibility" AS ENUM ('PUBLIC', 'PRIVATE', 'UNLISTED');

-- AlterTable
ALTER TABLE "channel" ADD COLUMN     "visibility" "channel_visibility" NOT NULL DEFAULT 'PUBLIC';
