const POSITIVE_INTEGER = /^[1-9]\d*$/;

/** `undefined` means unset: the caller supplies its own default. */
export function parseDbPoolMax(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const trimmed = raw.trim();
  if (!POSITIVE_INTEGER.test(trimmed)) {
    throw new Error(`DB_POOL_MAX must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`DB_POOL_MAX must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}
