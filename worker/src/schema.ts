// Minimal schema for the worker — mirrors the main app's schema.ts
// Only includes tables the worker writes to during ingestion.

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

const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) { return `vector(${config?.dimensions ?? 768})`; },
  toDriver(value) { return `[${value.join(",")}]`; },
  fromDriver(value) { return value.slice(1, -1).split(",").filter(Boolean).map(Number); },
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
  filmId: uuid("film_id").references(() => films.id, { onDelete: "cascade" }).notNull(),
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
  filmId: uuid("film_id").references(() => films.id, { onDelete: "cascade" }).notNull(),
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
  shotId: uuid("shot_id").references(() => shots.id, { onDelete: "cascade" }).notNull().unique(),
  movementType: text("movement_type").notNull(),
  direction: text("direction"),
  speed: text("speed"),
  shotSize: text("shot_size"),
  angleVertical: text("angle_vertical"),
  angleHorizontal: text("angle_horizontal"),
  angleSpecial: text("angle_special"),
  durationCat: text("duration_cat"),
  isCompound: boolean("is_compound").default(false),
  compoundParts: jsonb("compound_parts"),
  classificationSource: text("classification_source").default("manual"),
  confidence: real("confidence"),
  reviewStatus: text("review_status").default("unreviewed"),
});

export const shotSemantic = pgTable("shot_semantic", {
  id: uuid("id").defaultRandom().primaryKey(),
  shotId: uuid("shot_id").references(() => shots.id, { onDelete: "cascade" }).notNull().unique(),
  description: text("description"),
  subjects: text("subjects").array(),
  mood: text("mood"),
  lighting: text("lighting"),
  techniqueNotes: text("technique_notes"),
});

export const shotEmbeddings = pgTable("shot_embeddings", {
  shotId: uuid("shot_id").references(() => shots.id, { onDelete: "cascade" }).notNull().primaryKey(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  searchText: text("search_text"),
});
