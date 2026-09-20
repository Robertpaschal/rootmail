import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationItems, recentWorkspaceActions, unseenUpdates } from "./notification-items";
import type { Change } from "./changes";
import type { Thread } from "./types";

const now = Date.parse("2026-09-10T12:00:00Z");
const event: Change = { id: "rep-client-1", at: "2026-09-10T10:00:00Z", actor: "rootmail", headline: "rootmail throttled Sunset Villas", detail: "60 sends per hour", tone: "acted", action: { href: "/sub-tenants/client-1", label: "View sender" } };

test("Overview shows only recent, attributable system actions, not generic conditions", () => {
  const excluded: Change[] = [
    { ...event, id: "factor-score", at: null },
    { ...event, id: "quota-near" },
    { ...event, id: "dkim-client-1" },
    { ...event, actor: "user_1" },
    { ...event, gap: "Not yet measured" },
    { ...event, at: "2026-09-01T10:00:00Z" },
    { ...event, at: "2026-09-11T10:00:00Z" },
    { ...event, at: "invalid" },
  ];
  assert.deepEqual(recentWorkspaceActions([...excluded, event], now), [event]);
});

test("a dated but unresolved DNS issue remains in needs attention", () => {
  const items = notificationItems({ threads: [], changes: [{ ...event, id: "drift-client-1" }], campaigns: [], updates: [] });
  assert.equal(items[0].section, "attention");
});

test("reply notifications open the exact conversation and exclude answered/closed replies", () => {
  const thread = { id: "thr_123", status: "needs_reply", contact_name: "Ada", contact_email: "ada@example.test", subject: "Booking question", last_message_at: "2026-09-10T11:00:00Z" } as Thread;
  const items = notificationItems({ threads: [thread, { ...thread, id: "thr_closed", status: "closed" }, { ...thread, id: "thr_open", status: "open" }], changes: [], campaigns: [], updates: [] });
  assert.equal(items.length, 1);
  assert.equal(items[0].href, "/inbox/thr_123");
  assert.equal(items[0].section, "attention");
  assert.deepEqual(unseenUpdates(items, [], now), []);
});

test("only published releases become updates; seeing an update does not resolve an attention item", () => {
  const update = { id: "release_1", title: "Editor improvements", date: "2026-09-10T09:00:00Z", published_at: "2026-09-10T09:00:00Z", status: "published", changes: [{ kind: "improved", text: "Clearer editing controls." }] };
  const items = notificationItems({ threads: [], changes: [{ ...event, id: "factor-score", at: null }], campaigns: [], updates: [update, { ...update, id: "draft", status: "draft" }] });
  assert.equal(items.length, 2);
  const unseen = unseenUpdates(items, [], now);
  assert.equal(unseen.length, 1);
  assert.equal(unseen[0].kind, "release");
  assert.equal(unseenUpdates(items, [unseen[0].id], now).length, 0);
  assert.equal(items.filter((i) => i.section === "attention").length, 1);
});

test("old and future-dated release notes do not raise a new-update indicator", () => {
  const items = notificationItems({ threads: [], changes: [], campaigns: [], updates: [
    { id: "old", title: "Old release", date: "2026-01-01", published_at: null, status: "published", changes: [] },
    { id: "future", title: "Future release", date: "2026-12-01", published_at: null, status: "published", changes: [] },
  ] });
  assert.equal(unseenUpdates(items, [], now).length, 0);
});
