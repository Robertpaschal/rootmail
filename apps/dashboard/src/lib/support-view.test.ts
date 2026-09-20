import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";
import { filterSupportThreads, supportThreadSubject } from "./support-view";
import type { SupportTicket } from "./types";

test("support subjects prefer an explicit topic and otherwise name the first message", () => {
  equal(supportThreadSubject("Sender verification failed\nMore detail", "  Domain setup  "), "Domain setup");
  equal(supportThreadSubject("  Sender verification failed\nMore detail  ", "  "), "Sender verification failed");
  equal(supportThreadSubject("x".repeat(200)).length, 120);
  equal(supportThreadSubject("message", "x".repeat(250)).length, 200);
});

test("support search combines with status without hiding the active thread's data", () => {
  const tickets = [
    { id: "open", status: "open", subject: "Sender setup" },
    { id: "closed", status: "closed", subject: "Sender verification" },
    { id: "unnamed", status: "open", subject: null },
  ] as SupportTicket[];
  deepEqual(filterSupportThreads(tickets, "closed", " SENDER ").map((t) => t.id), ["closed"]);
  deepEqual(filterSupportThreads(tickets, "all", "sender").map((t) => t.id), ["open", "closed"]);
  deepEqual(filterSupportThreads(tickets, "open", "conversation").map((t) => t.id), ["unnamed"]);
  equal(tickets.length, 3);
});
