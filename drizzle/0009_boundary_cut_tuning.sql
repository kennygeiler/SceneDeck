-- Phase 10: global boundary presets, gold revision history, eval runs, film → preset.
-- Self-FK on eval_gold_revisions.replaces_revision_id for version chain.

CREATE TABLE IF NOT EXISTS "boundary_cut_presets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text UNIQUE,
  "description" text,
  "config" jsonb NOT NULL,
  "is_archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "eval_gold_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "film_id" uuid NOT NULL REFERENCES "films"("id") ON DELETE CASCADE,
  "window_start_sec" real,
  "window_end_sec" real,
  "payload" jsonb NOT NULL,
  "replaces_revision_id" uuid,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "eval_gold_revisions"
  ADD CONSTRAINT "eval_gold_revisions_replaces_fk"
  FOREIGN KEY ("replaces_revision_id") REFERENCES "eval_gold_revisions"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "boundary_eval_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "film_id" uuid NOT NULL REFERENCES "films"("id") ON DELETE CASCADE,
  "gold_revision_id" uuid NOT NULL REFERENCES "eval_gold_revisions"("id") ON DELETE CASCADE,
  "preset_id" uuid REFERENCES "boundary_cut_presets"("id") ON DELETE SET NULL,
  "predicted_payload" jsonb NOT NULL,
  "tolerance_sec" real DEFAULT 0.5 NOT NULL,
  "metrics" jsonb NOT NULL,
  "unmatched_gold_sec" jsonb NOT NULL,
  "unmatched_pred_sec" jsonb NOT NULL,
  "provenance" jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "films" ADD COLUMN IF NOT EXISTS "boundary_cut_preset_id" uuid REFERENCES "boundary_cut_presets"("id") ON DELETE SET NULL;
