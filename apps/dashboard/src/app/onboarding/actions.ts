"use server";

import { ApiError, ConnectionError, api } from "@/lib/rootmail";
import type { OnboardingInput } from "@/lib/types";

/** Save the wizard's business profile and mark onboarding complete. */
export async function completeOnboarding(input: OnboardingInput): Promise<{ error?: string }> {
  try {
    await api.completeOnboarding(input);
    return {};
  } catch (err) {
    if (err instanceof ApiError || err instanceof ConnectionError) return { error: err.message };
    return { error: "Couldn't save your details." };
  }
}
