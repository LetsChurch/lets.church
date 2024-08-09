-- AlterTable
ALTER TABLE "app_session" ALTER COLUMN "expires_at" SET DEFAULT (now() + '30 days'::interval);
