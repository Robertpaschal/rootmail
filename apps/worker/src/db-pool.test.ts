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

function run(dbPoolMax: string): { status: number | null; output: string } {
  const result = spawnSync(
    process.execPath,
    ["--import", tsxImport(), "--input-type=module", "-e",
      `import { WORKER_DB_POOL_DEFAULT } from "./src/db-pool.ts";
       import { closeDb, configuredDbPoolDefault, sql } from "@rootmail/db";
       console.log([WORKER_DB_POOL_DEFAULT, configuredDbPoolDefault(), sql.options.max, sql.options.idle_timeout, sql.options.max_lifetime].join(","));
       await closeDb();`],
    {
      cwd: packageDir,
      env: { ...process.env, DB_POOL_MAX: dbPoolMax },
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  return { status: result.status, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

describe("worker database pool", () => {
  it("passes a default of 3 into the shared client", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const pool = readFileSync(new URL("./db-pool.ts", import.meta.url), "utf8");
    assert.match(source, /^import "\.\/db-pool";/);
    assert.match(pool, /export const WORKER_DB_POOL_DEFAULT = 3/);
    assert.match(pool, /configureDbPool\(WORKER_DB_POOL_DEFAULT\)/);
    const result = run("");
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /3,3,3,20,1800/);
  });

  it("lets DB_POOL_MAX override the worker default on the opened client", () => {
    const result = run("2");
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /3,3,2,20,1800/);
  });
});
