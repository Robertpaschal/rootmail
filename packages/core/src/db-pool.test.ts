import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseDbPoolMax } from "./db-pool";

const packageDir = fileURLToPath(new URL("..", import.meta.url));

function tsxImport(): string {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve("tsx");
  } catch {
    return createRequire(fileURLToPath(new URL("../../../package.json", import.meta.url))).resolve("tsx");
  }
}

function importEnv(dbPoolMax: string | undefined): { status: number | null; output: string } {
  const env = { ...process.env };
  if (dbPoolMax === undefined) delete env.DB_POOL_MAX;
  else env.DB_POOL_MAX = dbPoolMax;
  const result = spawnSync(
    process.execPath,
    ["--import", tsxImport(), "--input-type=module", "-e", "import { env } from './src/env.ts'; console.log('POOL_MAX=' + String(env.DB_POOL_MAX))"],
    { cwd: packageDir, env, encoding: "utf8", timeout: 60_000 },
  );
  return { status: result.status, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

describe("parseDbPoolMax", () => {
  it("accepts a positive integer and treats blank as unset", () => {
    assert.equal(parseDbPoolMax(undefined), undefined);
    assert.equal(parseDbPoolMax(""), undefined);
    assert.equal(parseDbPoolMax("   "), undefined);
    assert.equal(parseDbPoolMax("5"), 5);
    assert.equal(parseDbPoolMax(" 12 "), 12);
  });

  it("rejects anything that is not a positive integer", () => {
    for (const raw of ["0", "-1", "1.5", "10abc", "nope", "+5", "01", "1e2", "9007199254740993"]) {
      assert.throws(
        () => parseDbPoolMax(raw),
        (err: Error) => {
          assert.match(err.message, /DB_POOL_MAX must be a positive integer/);
          assert.equal(err.message.includes(JSON.stringify(raw)), true);
          return true;
        },
      );
    }
  });
});

describe("DB_POOL_MAX at process startup", () => {
  it("loads a valid value onto env", () => {
    const result = importEnv("4");
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /POOL_MAX=4/);
  });

  it("treats a blank value as unset", () => {
    const result = importEnv("");
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /POOL_MAX=undefined/);
  });

  it("crashes with a clear error on an invalid value", () => {
    const result = importEnv("nope");
    assert.notEqual(result.status, 0);
    assert.match(result.output, /DB_POOL_MAX must be a positive integer/);
    assert.match(result.output, /nope/);
    assert.equal(result.output.includes("BEGIN PRIVATE KEY"), false);
    assert.equal(result.output.includes("BEGIN PUBLIC KEY"), false);
  });
});
