import { cache } from "react";
import { getClientScopeId } from "./client-scope";
import { loadChanges } from "./changes";
import { notificationItems } from "./notification-items";
import { api } from "./rootmail";

/** Request-scoped cache only: never share a user's notifications across requests. */
export const loadNotifications = cache(async () => {
  const [me, clientId] = await Promise.all([api.me(), getClientScopeId()]);
  const workspace = me.active_workspace ?? me.workspaces[0];
  const [threads, changes, campaigns, updates] = await Promise.allSettled([
    api.listThreads({ status: "needs_reply" }), loadChanges(20), api.listCampaigns(), api.listProductUpdates(),
  ]);
  const unavailable = [
    threads.status === "rejected" ? "Replies" : null,
    changes.status === "rejected" || changes.value.unreachable ? "Sending activity" : null,
    campaigns.status === "rejected" ? "Campaign progress" : null,
    updates.status === "rejected" ? "Product updates" : null,
  ].filter((v): v is string => v !== null);
  return {
    scope: `${me.user.id}:${workspace?.id ?? "none"}:${clientId ?? "workspace"}`,
    workspaceName: workspace?.name ?? "Your workspace",
    items: notificationItems({
      threads: threads.status === "fulfilled" ? threads.value.data : [],
      changes: changes.status === "fulfilled" ? changes.value.changes : [],
      campaigns: campaigns.status === "fulfilled" ? campaigns.value.data : [],
      updates: updates.status === "fulfilled" ? updates.value.data.slice(0, 10) : [],
    }),
    unavailable,
  };
});
export type NotificationsSnapshot = Awaited<ReturnType<typeof loadNotifications>>;
