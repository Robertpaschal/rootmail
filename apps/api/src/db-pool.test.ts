import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));

function tsxImport(): string {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve("tsx");
  } catch {
    return createRequire(fileURLToPath(new URL("../../../package.json", import.meta.url))).resolve("tsx");
  }
}

function run(script: string, dbPoolMax: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, ["--import", tsxImport(), "--input-type=module", "-e", script], {
    cwd: packageDir,
    env: { ...process.env, DB_POOL_MAX: dbPoolMax },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: result.status, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

const OPEN = `import { API_DB_POOL_DEFAULT } from "./src/db-pool.ts";
import { closeDb, configuredDbPoolDefault, sql } from "@rootmail/db";
console.log([API_DB_POOL_DEFAULT, configuredDbPoolDefault(), sql.options.max, sql.options.idle_timeout, sql.options.max_lifetime].join(","));
await closeDb();`;

describe("api database pool", () => {
  it("passes a default of 5 into the shared client", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const pool = readFileSync(new URL("./db-pool.ts", import.meta.url), "utf8");
    assert.match(source, /^import "\.\/db-pool";/);
    assert.match(pool, /export const API_DB_POOL_DEFAULT = 5/);
    assert.match(pool, /configureDbPool\(API_DB_POOL_DEFAULT\)/);
    const result = run(OPEN, "");
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /5,5,5,20,1800/);
  });

  it("lets DB_POOL_MAX override the api default on the opened client", () => {
    const result = run(OPEN, "4");
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /5,5,4,20,1800/);
  });
});
