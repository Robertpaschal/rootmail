// Relocated to @rootmail/db so the worker (waitlist admission, future automations)
// enrolls through the exact same trigger logic. This shim keeps call sites stable.
export { evaluateTriggers, exitEnrollments } from "@rootmail/db";
