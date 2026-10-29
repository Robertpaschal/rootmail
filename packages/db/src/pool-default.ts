export const UNCONFIGURED_DB_POOL_MAX = 10;

let configuredDefault: number | undefined;
let sealed = false;

export function configureDbPool(defaultMax: number): void {
  if (!Number.isInteger(defaultMax) || defaultMax < 1) {
    throw new Error("Database pool default must be a positive integer");
  }
  if (configuredDefault === defaultMax) return;
  if (sealed || configuredDefault !== undefined) {
    throw new Error("Database pool default is already set");
  }
  configuredDefault = defaultMax;
}

export function configuredDbPoolDefault(): number | undefined {
  return configuredDefault;
}

export function sealDbPoolDefault(): number {
  sealed = true;
  return configuredDefault ?? UNCONFIGURED_DB_POOL_MAX;
}
