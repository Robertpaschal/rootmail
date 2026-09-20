"use server";

import { loadNotifications } from "@/lib/notifications";

export async function refreshNotifications() {
  // Identity and client scope come from the session, never from client arguments.
  return loadNotifications();
}
