-- Background ingest jobs: enqueue on worker, poll by id + poll_token (no long-lived SSE).

CREATE TABLE IF NOT EXISTS "ingest_async_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "stage" text DEFAULT 'queued' NOT NULL,
  "poll_token" text NOT NULL UNIQUE,
  "request_body" jsonb NOT NULL,
  "progress" jsonb,
  "film_id" uuid,
  "ingest_run_id" uuid,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "ingest_async_jobs"
  ADD CONSTRAINT "ingest_async_jobs_film_id_films_id_fk"
  FOREIGN KEY ("film_id") REFERENCES "public"."films"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "ingest_async_jobs"
  ADD CONSTRAINT "ingest_async_jobs_ingest_run_id_ingest_runs_id_fk"
  FOREIGN KEY ("ingest_run_id") REFERENCES "public"."ingest_runs"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "ingest_async_jobs_status_created_idx" ON "ingest_async_jobs" ("status", "created_at");
