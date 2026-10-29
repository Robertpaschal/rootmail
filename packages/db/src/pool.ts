import { env } from "@rootmail/core";

export const DB_POOL_IDLE_TIMEOUT_SECONDS = 20;
export const DB_POOL_MAX_LIFETIME_SECONDS = 1800;

export interface DbPoolOptions {
  max: number;
  idle_timeout: number;
  max_lifetime: number;
}

export function dbPoolConfig(defaultMax: number, configuredMax: number | undefined): DbPoolOptions {
  const max = configuredMax ?? defaultMax;
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(
      configuredMax === undefined
        ? "Database pool default must be a positive integer"
        : `DB_POOL_MAX must be a positive integer, got ${String(configuredMax)}`,
    );
  }
  return {
    max,
    idle_timeout: DB_POOL_IDLE_TIMEOUT_SECONDS,
    max_lifetime: DB_POOL_MAX_LIFETIME_SECONDS,
  };
}

export function dbPoolOptions(defaultMax: number): DbPoolOptions {
  return dbPoolConfig(defaultMax, env.DB_POOL_MAX);
}
