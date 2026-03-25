CREATE TABLE "corpus_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_title" text NOT NULL,
	"source_type" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"context_statement" text,
	"embedding" vector(1536) NOT NULL,
	"search_text" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "film_embeddings" (
	"film_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(768) NOT NULL,
	"search_text" text
);
--> statement-breakpoint
CREATE TABLE "scene_embeddings" (
	"scene_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(768) NOT NULL,
	"search_text" text
);
--> statement-breakpoint
ALTER TABLE "film_embeddings" ADD CONSTRAINT "film_embeddings_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_embeddings" ADD CONSTRAINT "scene_embeddings_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;