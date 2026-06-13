import { cookies } from "next/headers";

export const KEY_COOKIE = "rm_key";

/** The connected API key, read from the httpOnly cookie (server-only). */
export async function getApiKey(): Promise<string | null> {
  const store = await cookies();
  return store.get(KEY_COOKIE)?.value ?? null;
}

/** live / test, inferred from the key prefix. */
export function keyMode(key: string): "live" | "test" | "unknown" {
  if (key.startsWith("rm_live_")) return "live";
  if (key.startsWith("rm_test_")) return "test";
  return "unknown";
}

/** rm_live_abcd…6f2a — safe to render in the UI. */
export function maskKey(key: string): string {
  const parts = key.split("_");
  const tail = key.slice(-4);
  if (parts.length >= 3) return `${parts[0]}_${parts[1]}_…${tail}`;
  return `…${tail}`;
}
