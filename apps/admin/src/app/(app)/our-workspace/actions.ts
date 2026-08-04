"use server";

import { adminApi } from "@/lib/admin-api";
import { ApiError } from "@/lib/admin-api";
import { dashboardUrl } from "@/lib/urls";

/**
 * Open the real dashboard, as rootmail.
 *
 * The whole bridge is this one function. Everything a staff member might want
 * to DO with our customer email — compose, campaign, segment, reply, look at a
 * bounce — happens in the product our customers use, reached through here. The
 * admin console never grows its own composer, because the moment it does we are
 * maintaining two email products and only one of them gets the work.
 *
 * `to` is a dashboard PATH, not a URL. It is validated again at the landing
 * route (see safeNext there) — this side is convenience, that side is the
 * control, because that is the side an attacker can reach directly.
 */
export async function openOurWorkspace(to?: string): Promise<{ url?: string; error?: string }> {
  try {
    const { code } = await adminApi.openInternal();
    const next = to && to.startsWith("/") && !to.startsWith("//") ? to : "/";
    return {
      url: `${dashboardUrl()}/impersonate?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`,
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return {
        error:
          "Your staff role can't email customers, so it can't open our workspace. Ask a superadmin for the announce permission.",
      };
    }
    return { error: "Couldn't open our workspace. Please try again." };
  }
}
