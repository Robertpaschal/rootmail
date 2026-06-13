import { type ConnectionOptions, Worker } from "bullmq";
import { createRedis, env, type SendJobData, SEND_QUEUE } from "@rootmail/core";
import { closeDb } from "@rootmail/db";
import { processSend } from "./pipeline";

const connection = createRedis() as unknown as ConnectionOptions;

const worker = new Worker<SendJobData>(
  SEND_QUEUE,
  async (job) => {
    await processSend(job.data);
  },
  { connection, concurrency: 10 },
);

worker.on("ready", () =>
  console.log(`rootmail worker ready — queue "${SEND_QUEUE}", provider "${env.MAIL_PROVIDER}"`),
);
worker.on("completed", (job) => console.log(`✓ sent ${job.data.messageId} (job ${job.id})`));
worker.on("failed", (job, err) =>
  console.error(`✗ failed ${job?.data.messageId} (job ${job?.id}): ${err.message}`),
);
worker.on("error", (err) => console.error("worker error:", err.message));

const shutdown = async (signal: string) => {
  console.log(`${signal} received — closing worker`);
  await worker.close();
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
