import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { loadLocalEnv } from "./load-env";
import * as schema from "./schema";

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

type DatabaseInstance = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as typeof globalThis & {
  __scenedeckDb?: DatabaseInstance;
};

export const db =
  globalForDb.__scenedeckDb ??
  drizzle(neon(databaseUrl), {
    schema,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__scenedeckDb = db;
}

export { schema };
