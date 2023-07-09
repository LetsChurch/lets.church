-- CreateTable
CREATE TABLE "newsletter_subscription" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "newsletter_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscription_email_key" ON "newsletter_subscription"("email");
