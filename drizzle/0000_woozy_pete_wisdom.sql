CREATE TABLE "films" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"director" text NOT NULL,
	"year" integer,
	"tmdb_id" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shot_embeddings" (
	"shot_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(768) NOT NULL,
	"search_text" text,
	CONSTRAINT "shot_embeddings_shot_id_unique" UNIQUE("shot_id")
);
--> statement-breakpoint
CREATE TABLE "shot_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shot_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"direction" text,
	"speed" text,
	"shot_size" text,
	"angle_vertical" text,
	"angle_horizontal" text,
	"angle_special" text,
	"duration_cat" text,
	"is_compound" boolean DEFAULT false,
	"compound_parts" jsonb,
	"classification_source" text DEFAULT 'manual',
	CONSTRAINT "shot_metadata_shot_id_unique" UNIQUE("shot_id")
);
--> statement-breakpoint
CREATE TABLE "shot_semantic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shot_id" uuid NOT NULL,
	"description" text,
	"subjects" text[],
	"mood" text,
	"lighting" text,
	"technique_notes" text,
	CONSTRAINT "shot_semantic_shot_id_unique" UNIQUE("shot_id")
);
--> statement-breakpoint
CREATE TABLE "shots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"film_id" uuid NOT NULL,
	"source_file" text,
	"start_tc" real,
	"end_tc" real,
	"duration" real,
	"video_url" text,
	"thumbnail_url" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shot_id" uuid NOT NULL,
	"overall_rating" integer,
	"field_ratings" jsonb,
	"corrections" jsonb,
	"notes" text,
	"verified_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "shot_embeddings" ADD CONSTRAINT "shot_embeddings_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_metadata" ADD CONSTRAINT "shot_metadata_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_semantic" ADD CONSTRAINT "shot_semantic_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_film_id_films_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE cascade ON UPDATE no action;