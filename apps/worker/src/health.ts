import { rm, writeFile } from "node:fs/promises";

const HEALTH_FILE = "/tmp/rootmail-worker-health.json";
type WorkerState = { isRunning(): boolean; client: Promise<{ status: string }> };

/** Local readiness heartbeat: every queue must be running with a ready connection. */
export function startWorkerHealth(workers: WorkerState[], healthFile = HEALTH_FILE): () => Promise<void> {
  let stopped = false;
  let pending: Promise<void> | undefined;
  let writing: Promise<void> | undefined;
  const update = async () => {
    try {
      const clients = await Promise.all(workers.map((worker) => worker.client));
      if (stopped) return;
      const ready = workers.every((worker) => worker.isRunning()) && clients.every((client) => client.status === "ready");
      writing = writeFile(healthFile, JSON.stringify({ ready, updatedAt: Date.now() }));
      await writing;
    } catch {
      // A stale or absent heartbeat fails the external check; never claim readiness.
    }
  };
  const tick = () => {
    if (!pending) pending = update().finally(() => { pending = undefined; });
  };
  tick();
  const timer = setInterval(tick, 5_000);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await writing?.catch(() => undefined);
    // Do not wait for a pending Redis connection when shutting down.
    await rm(healthFile, { force: true });
  };
}
