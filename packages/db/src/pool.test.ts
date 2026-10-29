import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dbPoolConfig } from "./pool";

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
  const env = { ...process.env, DB_POOL_MAX: dbPoolMax };
  const result = spawnSync(process.execPath, ["--import", tsxImport(), "--input-type=module", "-e", script], {
    cwd: packageDir,
    env,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: result.status, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

describe("database pool options", () => {
  it("uses the caller's default unless DB_POOL_MAX is set", () => {
    assert.deepEqual(dbPoolConfig(5, undefined), { max: 5, idle_timeout: 20, max_lifetime: 1800 });
    assert.deepEqual(dbPoolConfig(3, undefined), { max: 3, idle_timeout: 20, max_lifetime: 1800 });
    assert.equal(dbPoolConfig(5, 2).max, 2);
    assert.equal(dbPoolConfig(3, 9).max, 9);
    assert.equal(dbPoolConfig(10, undefined).max, 10);
    assert.throws(() => dbPoolConfig(0, undefined), /Database pool default must be a positive integer/);
    assert.throws(() => dbPoolConfig(5, 0), /DB_POOL_MAX must be a positive integer/);
  });

  it("opens an unconfigured client at max 10 with the idle and lifetime limits", () => {
    const result = run(
      `import { configuredDbPoolDefault } from "./src/pool-default.ts";
       const { closeDb, sql } = await import("./src/client.ts");
       console.log([String(configuredDbPoolDefault()), sql.options.max, sql.options.idle_timeout, sql.options.max_lifetime].join(","));
       await closeDb();`,
      "",
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /undefined,10,20,1800/);
  });

  it("opens with DB_POOL_MAX instead of the default the caller passed", () => {
    const result = run(
      `import { configureDbPool } from "./src/pool-default.ts";
       configureDbPool(5);
       const { closeDb, sql } = await import("./src/client.ts");
       console.log([sql.options.max, sql.options.idle_timeout, sql.options.max_lifetime].join(","));
       await closeDb();`,
      "4",
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /4,20,1800/);
  });

  it("rejects a second default and a non-positive default before the pool opens", () => {
    const result = run(
      `import { configureDbPool } from "./src/pool-default.ts";
       configureDbPool(5);
       configureDbPool(5);
       let saw = "";
       try { configureDbPool(3); } catch (err) { saw += (err instanceof Error ? err.message : ""); }
       try { configureDbPool(0); } catch (err) { saw += "|" + (err instanceof Error ? err.message : ""); }
       console.log(saw);`,
      "",
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /Database pool default is already set\|Database pool default must be a positive integer/);
  });
});
