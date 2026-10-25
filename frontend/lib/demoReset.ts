import { ApiError, apiPost } from "./api";
import { findDemoAccount } from "./demo";

/**
 * Temporary testing reset (backend `POST /api/demo/reset`): puts the caller's own demo account back into
 * a known state. Shown only while `EXPO_PUBLIC_DEMO_TOOLS=1`; remove with the backend route before
 * judging (fixed demo accounts, see the GitHub issues).
 */
export type DemoState = "empty" | "pets" | "past" | "confirmed" | "ready" | "in_care";

/**
 * The states to reset to. Each account resets on its own: an owner resets the owner side, a sitter the sitter side.
 * The hints name the sitter of the caller's set. A sitter has no "Empty" (she has no pets to remove).
 */
export function demoStates(role: "owner" | "sitter", sitterName: string, pets: [string, string]): { value: DemoState; label: string; hint: string }[] {
  const states: { value: DemoState; label: string; hint: string }[] = [
    { value: "empty", label: "Empty", hint: "No pets yet." },
    { value: "pets", label: role === "owner" ? "Pets only" : "Clean", hint: role === "owner" ? `${pets[0]} and ${pets[1]}, no booking.` : "No bookings, schedule open." },
    { value: "past", label: "Past stays", hint: role === "owner" ? `${pets[0]} and ${pets[1]} stayed with ${sitterName} before. No booking now.` : "Two finished stays, a cancelled request. Schedule open." },
    { value: "confirmed", label: "Booking accepted", hint: `${sitterName} accepted a stay. Next: Finish booking.` },
    { value: "ready", label: "Ready for drop-off", hint: `Paid, drop-off in an hour. ${sitterName} can tap Received.` },
    { value: "in_care", label: "In care", hint: `${pets[0]} and ${pets[1]} are with ${sitterName}.` },
  ];
  return role === "owner" ? states : states.filter((s) => s.value !== "empty");
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
