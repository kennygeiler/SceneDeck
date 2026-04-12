import type {
  BlockingTypeSlug,
  ColorTemperatureSlug,
  DepthTypeSlug,
  DominantLineSlug,
  DurationCategorySlug,
  FramingSlug,
  HorizontalAngleSlug,
  LightingDirectionSlug,
  LightingQualitySlug,
  ShotSizeSlug,
  SymmetryTypeSlug,
  VerticalAngleSlug,
} from "../lib/taxonomy";
import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { IngestProvenancePayload } from "../lib/pipeline-provenance";
import type { BoundaryCutPresetConfig } from "../lib/boundary-cut-preset";

/** Append-only log for structural H splits/merges (shot detail HITL). */
export type HitlAuditEntry = {
  at: string;
  action: "split" | "merge";
  payload: Record<string, unknown>;
};

export type ForegroundElement = string;
export type BackgroundElement = string;

export type VerificationFieldRatings = Record<string, number | null>;
export type VerificationCorrections = Record<string, string | null>;
export type ShotObjectAttributes = Record<string, string>;
export type ShotObjectKeyframe = {
  t: number;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type ShotSceneContext = {
  location?: string;
  interiorExterior?: string;
  timeOfDay?: string;
  period?: string;
  mood?: string;
  weather?: string;
};

const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 768})`;
  },
  toDriver(value) {
    if (!Array.isArray(value)) return "[]";
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return value
      .slice(1, -1)
      .split(",")
      .filter(Boolean)
      .map((entry) => Number(entry));
  },
});

export const films = pgTable("films", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  director: text("director").notNull(),
  year: integer("year"),
  tmdbId: integer("tmdb_id"),
  posterUrl: text("poster_url"),
  backdropUrl: text("backdrop_url"),
  overview: text("overview"),
  runtime: integer("runtime"),
  genres: text("genres").array(),
  sourceUrl: text("source_url"),
  /** Latest full-film ingest metadata (detector, models, taxonomy hash). */
  ingestProvenance: jsonb("ingest_provenance").$type<IngestProvenancePayload | null>(),
  /** Optional global boundary-cut preset applied on worker ingest when body does not override. */
  boundaryCutPresetId: uuid("boundary_cut_preset_id").references(
    () => boundaryCutPresets.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const scenes = pgTable("scenes", {
  id: uuid("id").defaultRandom().primaryKey(),
  filmId: uuid("film_id")
    .references(() => films.id, { onDelete: "cascade" })
    .notNull(),
  sceneNumber: integer("scene_number").notNull(),
  title: text("title"),
  description: text("description"),
  startTc: real("start_tc"),
  endTc: real("end_tc"),
  totalDuration: real("total_duration"),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  location: text("location"),
  interiorExterior: text("interior_exterior"),
  timeOfDay: text("time_of_day"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const shots = pgTable("shots", {
  id: uuid("id").defaultRandom().primaryKey(),
  filmId: uuid("film_id")
    .references(() => films.id, { onDelete: "cascade" })
    .notNull(),
  sceneId: uuid("scene_id").references(() => scenes.id, { onDelete: "set null" }),
  sourceFile: text("source_file"),
  startTc: real("start_tc"),
  endTc: real("end_tc"),
  duration: real("duration"),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  hitlAudit: jsonb("hitl_audit").$type<HitlAuditEntry[] | null>(),
});

export const shotMetadata = pgTable("shot_metadata", {
  id: uuid("id").defaultRandom().primaryKey(),
  shotId: uuid("shot_id")
    .references(() => shots.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  // Composition fields (replaces camera movement taxonomy)
  framing: text("framing").$type<FramingSlug>().notNull(),
  depth: text("depth").$type<DepthTypeSlug>(),
  blocking: text("blocking").$type<BlockingTypeSlug>(),
  symmetry: text("symmetry").$type<SymmetryTypeSlug>(),
  dominantLines: text("dominant_lines").$type<DominantLineSlug>(),
  lightingDirection: text("lighting_direction").$type<LightingDirectionSlug>(),
  lightingQuality: text("lighting_quality").$type<LightingQualitySlug>(),
  colorTemperature: text("color_temperature").$type<ColorTemperatureSlug>(),
  foregroundElements: text("foreground_elements").array(),
  backgroundElements: text("background_elements").array(),
  // Kept from original
  shotSize: text("shot_size").$type<ShotSizeSlug>(),
  angleVertical: text("angle_vertical").$type<VerticalAngleSlug>(),
  angleHorizontal: text("angle_horizontal").$type<HorizontalAngleSlug>(),
  durationCat: text("duration_cat").$type<DurationCategorySlug>(),
  classificationSource: text("classification_source").default("manual"),
  confidence: real("confidence"),
  reviewStatus: text("review_status").default("unreviewed"),
});

export const shotSemantic = pgTable("shot_semantic", {
  id: uuid("id").defaultRandom().primaryKey(),
  shotId: uuid("shot_id")
    .references(() => shots.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  description: text("description"),
  subjects: text("subjects").array(),
  mood: text("mood"),
  lighting: text("lighting"),
  techniqueNotes: text("technique_notes"),
});

export const verifications = pgTable("verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  shotId: uuid("shot_id")
    .references(() => shots.id, { onDelete: "cascade" })
    .notNull(),
  overallRating: integer("overall_rating"),
  fieldRatings: jsonb("field_ratings").$type<VerificationFieldRatings>(),
  corrections: jsonb("corrections").$type<VerificationCorrections>(),
  notes: text("notes"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow(),
});

export const shotEmbeddings = pgTable("shot_embeddings", {
  shotId: uuid("shot_id")
    .references(() => shots.id, { onDelete: "cascade" })
    .notNull()
    .primaryKey(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  searchText: text("search_text"),
});

/** Phase D: thumbnail CLIP vectors (768-d default model) for visual similarity—not taxonomy truth. */
export const shotImageEmbeddings = pgTable("shot_image_embeddings", {
  shotId: uuid("shot_id")
    .references(() => shots.id, { onDelete: "cascade" })
    .notNull()
    .primaryKey(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  model: text("model").notNull(),
});

export const shotObjects = pgTable("shot_objects", {
  id: uuid("id").defaultRandom().primaryKey(),
  shotId: uuid("shot_id")
    .references(() => shots.id, { onDelete: "cascade" })
    .notNull(),
  trackId: text("track_id").notNull(),
  label: text("label").notNull(),
  category: text("category"),
  confidence: real("confidence"),
  yoloClass: text("yolo_class"),
  yoloConfidence: real("yolo_confidence"),
  cinematicLabel: text("cinematic_label"),
  description: text("description"),
  significance: text("significance"),
  keyframes: jsonb("keyframes").$type<ShotObjectKeyframe[]>().notNull(),
  startTime: real("start_time").notNull(),
  endTime: real("end_time").notNull(),
  attributes: jsonb("attributes").$type<ShotObjectAttributes>(),
  sceneContext: jsonb("scene_context").$type<ShotSceneContext>(),
});

export type Film = typeof films.$inferSelect;
export type NewFilm = typeof films.$inferInsert;

export type Scene = typeof scenes.$inferSelect;
export type NewScene = typeof scenes.$inferInsert;

export type Shot = typeof shots.$inferSelect;
export type NewShot = typeof shots.$inferInsert;

export type ShotMetadata = typeof shotMetadata.$inferSelect;
export type NewShotMetadata = typeof shotMetadata.$inferInsert;

export type ShotSemantic = typeof shotSemantic.$inferSelect;
export type NewShotSemantic = typeof shotSemantic.$inferInsert;

export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;

export type ShotEmbedding = typeof shotEmbeddings.$inferSelect;
export type NewShotEmbedding = typeof shotEmbeddings.$inferInsert;

export type ShotImageEmbedding = typeof shotImageEmbeddings.$inferSelect;
export type NewShotImageEmbedding = typeof shotImageEmbeddings.$inferInsert;

export type ShotObject = typeof shotObjects.$inferSelect;
export type NewShotObject = typeof shotObjects.$inferInsert;

export const pipelineJobs = pgTable("pipeline_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  filmId: uuid("film_id").references(() => films.id, { onDelete: "cascade" }),
  shotId: uuid("shot_id").references(() => shots.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(), // detect, extract, classify, embed
  status: text("status").notNull().default("queued"), // queued, running, completed, failed, needs_review
  workerId: text("worker_id"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  attempts: integer("attempts").default(0),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type PipelineJob = typeof pipelineJobs.$inferSelect;
export type NewPipelineJob = typeof pipelineJobs.$inferInsert;

// ---------------------------------------------------------------------------
// Batch Jobs (M2: Gemini Batch API queue via Postgres SKIP LOCKED)
// ---------------------------------------------------------------------------

export const batchJobs = pgTable("batch_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  filmId: uuid("film_id").references(() => films.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending, submitted, processing, completed, failed
  jsonlPath: text("jsonl_path"),
  batchApiName: text("batch_api_name"), // Gemini Batch API operation name
  shotCount: integer("shot_count"),
  resultCount: integer("result_count"),
  error: text("error"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type BatchJob = typeof batchJobs.$inferSelect;
export type NewBatchJob = typeof batchJobs.$inferInsert;

/** Durable record of interactive film ingest (observability, future resume UI). */
export const ingestRuns = pgTable("ingest_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  filmId: uuid("film_id")
    .references(() => films.id, { onDelete: "cascade" })
    .notNull(),
  status: text("status").notNull().default("running"),
  stage: text("stage").notNull().default("group"),
  errorMessage: text("error_message"),
  shotCount: integer("shot_count"),
  sceneCount: integer("scene_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type IngestRun = typeof ingestRuns.$inferSelect;
export type NewIngestRun = typeof ingestRuns.$inferInsert;

// ---------------------------------------------------------------------------
// M5: RAG Intelligence Layer — Multi-granularity Embeddings + Corpus
// ---------------------------------------------------------------------------

export const sceneEmbeddings = pgTable("scene_embeddings", {
  sceneId: uuid("scene_id")
    .references(() => scenes.id, { onDelete: "cascade" })
    .notNull()
    .primaryKey(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  searchText: text("search_text"),
});

export const filmEmbeddings = pgTable("film_embeddings", {
  filmId: uuid("film_id")
    .references(() => films.id, { onDelete: "cascade" })
    .notNull()
    .primaryKey(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  searchText: text("search_text"),
});

export const corpusChunks = pgTable("corpus_chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceTitle: text("source_title").notNull(),
  sourceType: text("source_type").notNull(), // textbook, paper, article, analysis
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  contextStatement: text("context_statement"), // LLM-generated context prepended before embedding
  embedding: vector("embedding", { dimensions: 1536 }).notNull(), // text-embedding-3-large for corpus
  searchText: text("search_text"), // tsvector source for BM25
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type SceneEmbedding = typeof sceneEmbeddings.$inferSelect;
export type NewSceneEmbedding = typeof sceneEmbeddings.$inferInsert;

export type FilmEmbedding = typeof filmEmbeddings.$inferSelect;
export type NewFilmEmbedding = typeof filmEmbeddings.$inferInsert;

export type CorpusChunk = typeof corpusChunks.$inferSelect;
export type NewCorpusChunk = typeof corpusChunks.$inferInsert;

// ---------------------------------------------------------------------------
// M7: API Keys (operator-issued, no OAuth, no user accounts — AC-21)
// ---------------------------------------------------------------------------

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revoked: boolean("revoked").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

// ---------------------------------------------------------------------------
// Private eval artifacts (human verified cuts / predicted JSON; kind column still uses "gold") — not committed to git
// ---------------------------------------------------------------------------

export const evalArtifacts = pgTable("eval_artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").notNull(),
  filmId: uuid("film_id").references(() => films.id, { onDelete: "set null" }),
  sessionId: text("session_id"),
  label: text("label"),
  payload: jsonb("payload").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type EvalArtifact = typeof evalArtifacts.$inferSelect;
export type NewEvalArtifact = typeof evalArtifacts.$inferInsert;

// ---------------------------------------------------------------------------
// Phase 10: Boundary cut tuning — global presets, human verified cuts revisions (eval_gold_revisions), eval runs
// ---------------------------------------------------------------------------

export const boundaryCutPresets = pgTable("boundary_cut_presets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  description: text("description"),
  config: jsonb("config").$type<BoundaryCutPresetConfig>().notNull(),
  /** Operator-seeded baselines (e.g. slugged cemented profiles). Not set by public API. */
  isSystem: boolean("is_system").default(false).notNull(),
  /**
   * When true, preset appears in community ingest picker. System presets are always listed.
   * Set false for experimental duplicates operators do not want to surface globally.
   */
  shareWithCommunity: boolean("share_with_community").default(true).notNull(),
  contributorLabel: text("contributor_label"),
  /** F1 snapshot from the eval run cited at publish time (informational). */
  validatedF1: real("validated_f1"),
  /** Optional link to the boundary_eval_runs row that validated this contribution. */
  sourceEvalRunId: uuid("source_eval_run_id"),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const evalGoldRevisions = pgTable("eval_gold_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  filmId: uuid("film_id")
    .references(() => films.id, { onDelete: "cascade" })
    .notNull(),
  /** Inclusive window on film timeline; both null = full source. */
  windowStartSec: real("window_start_sec"),
  windowEndSec: real("window_end_sec"),
  /** Shape: { cutsSec: number[], notes?: string } */
  payload: jsonb("payload").notNull(),
  /** Prior revision in the same film/window chain (FK enforced in SQL migration). */
  replacesRevisionId: uuid("replaces_revision_id"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const boundaryEvalRuns = pgTable("boundary_eval_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  filmId: uuid("film_id")
    .references(() => films.id, { onDelete: "cascade" })
    .notNull(),
  goldRevisionId: uuid("gold_revision_id")
    .references(() => evalGoldRevisions.id, { onDelete: "cascade" })
    .notNull(),
  presetId: uuid("preset_id").references(() => boundaryCutPresets.id, {
    onDelete: "set null",
  }),
  predictedPayload: jsonb("predicted_payload").notNull(),
  toleranceSec: real("tolerance_sec").notNull().default(0.5),
  metrics: jsonb("metrics").notNull(),
  unmatchedGoldSec: jsonb("unmatched_gold_sec").notNull(),
  unmatchedPredSec: jsonb("unmatched_pred_sec").notNull(),
  provenance: jsonb("provenance"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type BoundaryCutPreset = typeof boundaryCutPresets.$inferSelect;
export type NewBoundaryCutPreset = typeof boundaryCutPresets.$inferInsert;
export type EvalGoldRevision = typeof evalGoldRevisions.$inferSelect;
export type NewEvalGoldRevision = typeof evalGoldRevisions.$inferInsert;
export type BoundaryEvalRun = typeof boundaryEvalRuns.$inferSelect;
export type NewBoundaryEvalRun = typeof boundaryEvalRuns.$inferInsert;
