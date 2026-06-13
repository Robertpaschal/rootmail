import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@rootmail/core";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(client, { schema });
export const sql = client;
export type Database = typeof db;

export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
