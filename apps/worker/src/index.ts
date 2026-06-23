import { type ConnectionOptions, Worker } from "bullmq";
import {
  BULL_PREFIX,
  CAMPAIGN_QUEUE,
  type CampaignJob,
  createRedis,
  env,
  RETENTION_QUEUE,
  scheduleRetentionSweep,
  scheduleSequenceTick,
  SEND_QUEUE,
  SEQUENCE_QUEUE,
  type SendJobData,
  SYSTEM_MAIL_QUEUE,
  type SystemMailJob,
  WEBHOOK_QUEUE,
} from "@rootmail/core";
import { closeDb } from "@rootmail/db";
import { processCampaignSend } from "./campaigns";
import { processSend } from "./pipeline";
import { processRetentionSweep } from "./retention";
import { processSequenceTick } from "./sequences";
import { processSystemMail } from "./system-mail";
import { processWebhookJob } from "./webhooks";

const connection = createRedis() as unknown as ConnectionOptions;

const worker = new Worker<SendJobData>(
  SEND_QUEUE,
  async (job) => {
    await processSend(job.data);
  },
  { connection, prefix: BULL_PREFIX, concurrency: 10 },
);

worker.on("ready", () =>
  console.log(`rootmail worker ready — queue "${SEND_QUEUE}", provider "${env.MAIL_PROVIDER}"`),
);
worker.on("completed", (job) => console.log(`✓ sent ${job.data.messageId} (job ${job.id})`));
worker.on("failed", (job, err) =>
  console.error(`✗ failed ${job?.data.messageId} (job ${job?.id}): ${err.message}`),
);
worker.on("error", (err) => console.error("worker error:", err.message));

// Outbound dev webhooks run on their own queue + connection.
const webhookWorker = new Worker(
  WEBHOOK_QUEUE,
  async (job) => {
    await processWebhookJob(job);
  },
  { connection: createRedis() as unknown as ConnectionOptions, prefix: BULL_PREFIX, concurrency: 5 },
);
webhookWorker.on("ready", () => console.log(`rootmail webhook worker ready — queue "${WEBHOOK_QUEUE}"`));
webhookWorker.on("error", (err) => console.error("webhook worker error:", err.message));

// Sequences: a repeatable tick advances all due enrollments (concurrency 1 so
// ticks never overlap).
const sequenceWorker = new Worker(
  SEQUENCE_QUEUE,
  async (job) => {
    if (job.name === "tick") await processSequenceTick();
  },
  { connection: createRedis() as unknown as ConnectionOptions, prefix: BULL_PREFIX, concurrency: 1 },
);
sequenceWorker.on("ready", () => {
  console.log(`rootmail sequence worker ready — queue "${SEQUENCE_QUEUE}"`);
  void scheduleSequenceTick();
});
sequenceWorker.on("error", (err) => console.error("sequence worker error:", err.message));

// Campaigns: one job fans a campaign out to its whole list.
const campaignWorker = new Worker<CampaignJob>(
  CAMPAIGN_QUEUE,
  async (job) => {
    await processCampaignSend(job.data);
  },
  { connection: createRedis() as unknown as ConnectionOptions, prefix: BULL_PREFIX, concurrency: 3 },
);
campaignWorker.on("ready", () => console.log(`rootmail campaign worker ready — queue "${CAMPAIGN_QUEUE}"`));
campaignWorker.on("error", (err) => console.error("campaign worker error:", err.message));

// Platform/transactional email (verification, password reset) on its own queue.
const systemMailWorker = new Worker<SystemMailJob>(
  SYSTEM_MAIL_QUEUE,
  async (job) => {
    await processSystemMail(job.data);
  },
  { connection: createRedis() as unknown as ConnectionOptions, prefix: BULL_PREFIX, concurrency: 5 },
);
systemMailWorker.on("ready", () =>
  console.log(`rootmail system-mail worker ready — queue "${SYSTEM_MAIL_QUEUE}"`),
);
systemMailWorker.on("error", (err) => console.error("system-mail worker error:", err.message));

// Data retention: a repeatable daily sweep redacts/deletes messages past each
// workspace's retention window (no-op until a workspace opts in). Concurrency 1.
const retentionWorker = new Worker(
  RETENTION_QUEUE,
  async (job) => {
    if (job.name === "sweep") await processRetentionSweep();
  },
  { connection: createRedis() as unknown as ConnectionOptions, prefix: BULL_PREFIX, concurrency: 1 },
);
retentionWorker.on("ready", () => {
  console.log(`rootmail retention worker ready — queue "${RETENTION_QUEUE}"`);
  void scheduleRetentionSweep();
});
retentionWorker.on("error", (err) => console.error("retention worker error:", err.message));

const shutdown = async (signal: string) => {
  console.log(`${signal} received — closing worker`);
  await worker.close();
  await webhookWorker.close();
  await sequenceWorker.close();
  await campaignWorker.close();
  await systemMailWorker.close();
  await retentionWorker.close();
  await closeDb();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
