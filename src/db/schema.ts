import type {
  DirectionSlug,
  DurationCategorySlug,
  HorizontalAngleSlug,
  MovementTypeSlug,
  ShotSizeSlug,
  SpeedSlug,
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

export type CompoundPart = {
  type: MovementTypeSlug;
  direction: DirectionSlug;
};

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
});

export const shotMetadata = pgTable("shot_metadata", {
  id: uuid("id").defaultRandom().primaryKey(),
  shotId: uuid("shot_id")
    .references(() => shots.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  movementType: text("movement_type").$type<MovementTypeSlug>().notNull(),
  direction: text("direction").$type<DirectionSlug>(),
  speed: text("speed").$type<SpeedSlug>(),
  shotSize: text("shot_size").$type<ShotSizeSlug>(),
  angleVertical: text("angle_vertical").$type<VerticalAngleSlug>(),
  angleHorizontal: text("angle_horizontal").$type<HorizontalAngleSlug>(),
  angleSpecial: text("angle_special"),
  durationCat: text("duration_cat").$type<DurationCategorySlug>(),
  isCompound: boolean("is_compound").default(false),
  compoundParts: jsonb("compound_parts").$type<CompoundPart[]>(),
  classificationSource: text("classification_source").default("manual"),
  confidence: real("confidence"),
  reviewStatus: text("review_status").default("unreviewed"),
  validationFlags: text("validation_flags").array(),
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
