-- CreateEnum
CREATE TYPE "public"."upload_view_source" AS ENUM ('WEBSITE', 'EMBED');

-- AlterTable
ALTER TABLE "public"."upload_view" ADD COLUMN     "source" "public"."upload_view_source" DEFAULT 'WEBSITE';
