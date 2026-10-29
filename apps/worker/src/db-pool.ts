import { configureDbPool } from "@rootmail/db/pool-default";

export const WORKER_DB_POOL_DEFAULT = 3;

configureDbPool(WORKER_DB_POOL_DEFAULT);
