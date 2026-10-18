import { ApiError, apiPost } from "./api";
import { findDemoAccount } from "./demo";

/**
 * Temporary testing reset (backend `POST /api/demo/reset`): puts the caller's demo set (their owner and
 * sitter) back into a known state. Shown only while `EXPO_PUBLIC_DEMO_TOOLS=1`; remove with the backend route before
 * judging (docs/plan/TODO.md, "Demo reset").
 */
export type DemoState = "empty" | "pets" | "confirmed" | "ready" | "in_care";

/** The states to reset to; the hints name the sitter of the caller's set. */
export function demoStates(sitterName: string): { value: DemoState; label: string; hint: string }[] {
  return [
    { value: "empty", label: "Empty", hint: "No pets yet. The sitter is ready." },
    { value: "pets", label: "Pets only", hint: "Max and Mochi, no booking." },
    { value: "confirmed", label: "Booking accepted", hint: `${sitterName} accepted a stay. Next: Finish booking.` },
    { value: "ready", label: "Ready for drop-off", hint: `Paid, drop-off in an hour. ${sitterName} can tap Received.` },
    { value: "in_care", label: "In care", hint: `Max and Mochi are with ${sitterName}.` },
  ];
}

export const isDemoToolsEnabled = process.env.EXPO_PUBLIC_DEMO_TOOLS === "1";

export function isDemoAccount(email: string | undefined): boolean {
  return findDemoAccount(email) !== null;
}

export async function resetDemo(state: DemoState): Promise<void> {
  try {
    await apiPost("/api/demo/reset", { state });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error("Demo reset is switched off on this backend (set DEMO_RESET_ENABLED=1).");
    }
    throw error;
  }
}
