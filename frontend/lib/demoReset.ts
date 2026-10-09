import { ApiError, apiPost } from "./api";
import { DEMO_ACCOUNTS } from "./demo";

/**
 * Temporary testing reset (backend `POST /api/demo/reset`): puts the two demo accounts back into a
 * known state. Shown only while `EXPO_PUBLIC_DEMO_TOOLS=1`; remove with the backend route before
 * judging (docs/plan/TODO.md, "Demo reset").
 */
export type DemoState = "empty" | "pets" | "confirmed" | "ready" | "in_care";

export const DEMO_STATES: { value: DemoState; label: string; hint: string }[] = [
  { value: "empty", label: "Empty", hint: "No pets yet. The sitter is ready (schedule, prices)." },
  { value: "pets", label: "Pets only", hint: "Max and Mochi, no booking. The start of the booking flow." },
  { value: "confirmed", label: "Booking accepted", hint: "Chloe accepted a stay. Next: Finish booking." },
  { value: "ready", label: "Ready for drop-off", hint: "Paid, drop-off in an hour. Chloe can tap Received." },
  { value: "in_care", label: "In care", hint: "Max and Mochi are with Chloe. Check-ins, photos and reports work." },
];

export const isDemoToolsEnabled = process.env.EXPO_PUBLIC_DEMO_TOOLS === "1";

export function isDemoAccount(email: string | undefined): boolean {
  return Object.values(DEMO_ACCOUNTS).some((account) => account.email === email);
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
