import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@rootmail/core";
import * as schema from "./schema";
import { dbPoolOptions } from "./pool";
import { sealDbPoolDefault } from "./pool-default";

const client = postgres(env.DATABASE_URL, dbPoolOptions(sealDbPoolDefault()));

export const db = drizzle(client, { schema });
export const sql = client;
export type Database = typeof db;

export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
