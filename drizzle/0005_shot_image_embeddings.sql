CREATE TABLE IF NOT EXISTS "shot_image_embeddings" (
	"shot_id" uuid PRIMARY KEY NOT NULL REFERENCES "shots"("id") ON DELETE CASCADE,
	"embedding" vector(768) NOT NULL,
	"model" text NOT NULL
);
