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
export type VerificationCorrections = Record<string, unknown>;

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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const shots = pgTable("shots", {
  id: uuid("id").defaultRandom().primaryKey(),
  filmId: uuid("film_id")
    .references(() => films.id, { onDelete: "cascade" })
    .notNull(),
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
  verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow(),
});

export const shotEmbeddings = pgTable("shot_embeddings", {
  shotId: uuid("shot_id")
    .references(() => shots.id, { onDelete: "cascade" })
    .notNull()
    .unique()
    .primaryKey(),
  embedding: vector("embedding", { dimensions: 768 }).notNull(),
  searchText: text("search_text"),
});

export type Film = typeof films.$inferSelect;
export type NewFilm = typeof films.$inferInsert;

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
