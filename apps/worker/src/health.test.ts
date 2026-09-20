import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { startWorkerHealth } from "./health";

for (const status of ["ready", "reconnecting"]) {
  test(`worker heartbeat reports ${status} truthfully and is removed at shutdown`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "rootmail-health-"));
    const file = join(dir, "health.json");
    const stop = startWorkerHealth([{ isRunning: () => true, client: Promise.resolve({ status }) }], file);
    try {
      let result: { ready: boolean; updatedAt: number } | undefined;
      for (let attempt = 0; attempt < 100; attempt++) {
        try { result = JSON.parse(await readFile(file, "utf8")); break; } catch { await setTimeout(10); }
      }
      assert.ok(result);
      assert.equal(result.ready, status === "ready");
      assert.ok(Date.now() - result.updatedAt < 5_000);
      await stop();
      await assert.rejects(readFile(file), { code: "ENOENT" });
    } finally { await stop(); await rm(dir, { recursive: true, force: true }); }
  });
}

test("shutdown does not hang on an unavailable queue connection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rootmail-health-"));
  const stop = startWorkerHealth([{ isRunning: () => false, client: new Promise(() => {}) }], join(dir, "health.json"));
  try { await stop(); } finally { await rm(dir, { recursive: true, force: true }); }
});
