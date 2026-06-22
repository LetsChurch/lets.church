CREATE TABLE "bible_book" (
	"translation_id" text NOT NULL,
	"usfm" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"ordinal" integer NOT NULL,
	"chapter_count" integer NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "bible_book_translation_id_usfm_pk" PRIMARY KEY("translation_id","usfm")
);
--> statement-breakpoint
CREATE TABLE "bible_cross_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_id" text NOT NULL,
	"from_book" text NOT NULL,
	"from_chapter" integer NOT NULL,
	"from_verse" integer NOT NULL,
	"to_book" text NOT NULL,
	"to_chapter" integer NOT NULL,
	"to_verse" integer,
	"to_verse_end" integer,
	"kind" text DEFAULT 'reference' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bible_lexeme" (
	"strong" text PRIMARY KEY NOT NULL,
	"language" text NOT NULL,
	"lemma" text NOT NULL,
	"transliteration" text,
	"pronunciation" text,
	"gloss" text,
	"kjv_def" text,
	"derivation" text
);
--> statement-breakpoint
CREATE TABLE "bible_token" (
	"translation_id" text NOT NULL,
	"book" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"position" integer NOT NULL,
	"surface" text NOT NULL,
	"strong" text,
	"lemma" text,
	"morph" text,
	"divine_name" boolean DEFAULT false NOT NULL,
	"ot_quote" boolean DEFAULT false NOT NULL,
	"words_of_jesus" boolean DEFAULT false NOT NULL,
	CONSTRAINT "bible_token_translation_id_book_chapter_verse_position_pk" PRIMARY KEY("translation_id","book","chapter","verse","position")
);
--> statement-breakpoint
CREATE TABLE "bible_translation" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"direction" text DEFAULT 'ltr' NOT NULL,
	"versification" text DEFAULT 'org' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bible_verse" (
	"translation_id" text NOT NULL,
	"book" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"ref" text NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "bible_verse_translation_id_book_chapter_verse_pk" PRIMARY KEY("translation_id","book","chapter","verse")
);
--> statement-breakpoint
CREATE TABLE "oidc_login_request" (
	"state" text PRIMARY KEY NOT NULL,
	"verifier" text NOT NULL,
	"nonce" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub" text NOT NULL,
	"claims" jsonb NOT NULL,
	"id_token" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_progress" (
	"sub" text NOT NULL,
	"book" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_sub_book_chapter_pk" PRIMARY KEY("sub","book","chapter")
);
--> statement-breakpoint
CREATE TABLE "user_highlight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub" text NOT NULL,
	"book" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"ref" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub" text NOT NULL,
	"book" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"ref" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"sub" text PRIMARY KEY NOT NULL,
	"translation" text,
	"red_letter" boolean,
	"verse_numbers" boolean,
	"text_size" integer,
	"divine_name" text,
	"source_overlay" boolean,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bible_book" ADD CONSTRAINT "bible_book_translation_id_bible_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."bible_translation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_cross_reference" ADD CONSTRAINT "bible_cross_reference_translation_id_bible_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."bible_translation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_token" ADD CONSTRAINT "bible_token_translation_id_bible_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."bible_translation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_verse" ADD CONSTRAINT "bible_verse_translation_id_bible_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."bible_translation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bible_book_translation_slug_idx" ON "bible_book" USING btree ("translation_id","slug");--> statement-breakpoint
CREATE INDEX "bible_xref_from_idx" ON "bible_cross_reference" USING btree ("translation_id","from_book","from_chapter","from_verse");--> statement-breakpoint
CREATE INDEX "bible_xref_to_idx" ON "bible_cross_reference" USING btree ("translation_id","to_book","to_chapter");--> statement-breakpoint
CREATE INDEX "bible_token_strong_idx" ON "bible_token" USING btree ("translation_id","strong");--> statement-breakpoint
CREATE UNIQUE INDEX "bible_translation_single_default_idx" ON "bible_translation" USING btree ("is_default") WHERE "bible_translation"."is_default";--> statement-breakpoint
CREATE INDEX "bible_verse_ordinal_idx" ON "bible_verse" USING btree ("translation_id","ordinal");--> statement-breakpoint
CREATE INDEX "reading_progress_sub_idx" ON "reading_progress" USING btree ("sub","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_highlight_sub_ref_idx" ON "user_highlight" USING btree ("sub","ref");--> statement-breakpoint
CREATE INDEX "user_highlight_sub_idx" ON "user_highlight" USING btree ("sub","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_note_sub_ref_idx" ON "user_note" USING btree ("sub","ref");--> statement-breakpoint
CREATE INDEX "user_note_sub_idx" ON "user_note" USING btree ("sub","updated_at");