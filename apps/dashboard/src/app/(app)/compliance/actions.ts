"use server";

import { ApiError, api } from "@/lib/rootmail";

/**
 * Generate a signed compliance export for a date range. Date inputs arrive as
 * YYYY-MM-DD; widen `to` to end-of-day so the range is inclusive. Returns the
 * serialized bundle for the client to download, or an actionable error.
 */
export async function generateComplianceExport(
  from: string,
  to: string,
): Promise<{ data?: string; filename?: string; error?: string; locked?: boolean }> {
  if (!from) return { error: "Pick a start date." };
  const fromISO = new Date(`${from}T00:00:00.000Z`);
  const toISO = to ? new Date(`${to}T23:59:59.999Z`) : undefined;
  if (Number.isNaN(fromISO.getTime()) || (toISO && Number.isNaN(toISO.getTime()))) {
    return { error: "Invalid date." };
  }

  try {
    const exp = await api.getComplianceExport({
      from: fromISO.toISOString(),
      to: toISO?.toISOString(),
    });
    return {
      data: JSON.stringify(exp, null, 2),
      filename: `rootmail-compliance-${from}_to_${to || new Date().toISOString().slice(0, 10)}.json`,
    };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message, locked: err.status === 402 };
    return { error: "Could not generate the export. Please try again." };
  }
}
