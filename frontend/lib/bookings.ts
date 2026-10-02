import { getSupabase } from "./supabase";

/**
 * Booking RPC wrappers (phase-03b). RPCs raise the error code as the message —
 * full list in supabase/README.md "RPC errors"; each screen adds the copy it needs.
 */

const MESSAGES: Record<string, string> = {
  booking_in_progress: "The pets are already with you — change the pick-up time instead.",
  invalid_status: "This booking has already changed. Reopen it to see the latest.",
  not_allowed: "You can't change this booking.",
};

export function bookingErrorMessage(code: string | undefined, fallback: string): string {
  return (code && MESSAGES[code]) || fallback;
}

/** Owner or sitter, before the drop-off (3B.7). The other side gets `booking_cancelled`. */
export async function cancelBooking(bookingId: string, reason: string | null): Promise<void> {
  const { error } = await getSupabase().rpc("cancel_booking", { p_booking: bookingId, p_reason: reason });
  if (error) {
    throw new Error(bookingErrorMessage(error.message, "Couldn't cancel this booking. Try again."));
  }
}
