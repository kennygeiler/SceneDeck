CREATE TABLE IF NOT EXISTS "eval_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL,
  "film_id" uuid REFERENCES "films"("id") ON DELETE SET NULL,
  "session_id" text,
  "label" text,
  "payload" jsonb NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "created_at" timestamp with time zone DEFAULT now()
);
