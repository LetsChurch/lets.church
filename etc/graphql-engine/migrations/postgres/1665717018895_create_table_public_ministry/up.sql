CREATE TABLE "public"."ministry" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "slug" citext NOT NULL, "name" text NOT NULL, PRIMARY KEY ("id") , UNIQUE ("slug"));
CREATE EXTENSION IF NOT EXISTS pgcrypto;
