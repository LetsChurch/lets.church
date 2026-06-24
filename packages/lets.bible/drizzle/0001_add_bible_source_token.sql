CREATE TABLE "bible_source_token" (
	"translation_id" text NOT NULL,
	"book" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"position" integer NOT NULL,
	"surface" text NOT NULL,
	"transliteration" text,
	"strong" text,
	"lemma" text,
	"gloss" text,
	"english" text,
	"morph" text,
	"language" text NOT NULL,
	CONSTRAINT "bible_source_token_translation_id_book_chapter_verse_position_pk" PRIMARY KEY("translation_id","book","chapter","verse","position")
);
--> statement-breakpoint
ALTER TABLE "bible_source_token" ADD CONSTRAINT "bible_source_token_translation_id_bible_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."bible_translation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bible_source_token_strong_idx" ON "bible_source_token" USING btree ("translation_id","strong");