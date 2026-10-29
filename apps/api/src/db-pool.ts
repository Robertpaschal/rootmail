import { configureDbPool } from "@rootmail/db/pool-default";

export const API_DB_POOL_DEFAULT = 5;

configureDbPool(API_DB_POOL_DEFAULT);
