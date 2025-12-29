-- AlterTable
ALTER TABLE "channel" ADD COLUMN     "apple_podcasts_url" TEXT,
ADD COLUMN     "facebook_url" TEXT,
ADD COLUMN     "instagram_url" TEXT,
ADD COLUMN     "linkedin_url" TEXT,
ADD COLUMN     "rss_url" TEXT,
ADD COLUMN     "spotify_url" TEXT,
ADD COLUMN     "threads_url" TEXT,
ADD COLUMN     "tiktok_url" TEXT,
ADD COLUMN     "website_url" TEXT,
ADD COLUMN     "x_url" TEXT,
ADD COLUMN     "youtube_url" TEXT;

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "apple_podcasts_url" TEXT,
ADD COLUMN     "facebook_url" TEXT,
ADD COLUMN     "instagram_url" TEXT,
ADD COLUMN     "linkedin_url" TEXT,
ADD COLUMN     "rss_url" TEXT,
ADD COLUMN     "spotify_url" TEXT,
ADD COLUMN     "threads_url" TEXT,
ADD COLUMN     "tiktok_url" TEXT,
ADD COLUMN     "x_url" TEXT,
ADD COLUMN     "youtube_url" TEXT;
