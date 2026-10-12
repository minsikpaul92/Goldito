import { useCallback } from "react";

import type { BookingSummary, HandoffKind } from "../../lib/bookings";
import { getMyHomePoint } from "../../lib/transit";
import { StartTripResult, useTrip } from "../../providers/TripProvider";
import { useSession } from "../../providers/SessionProvider";
import { useToast } from "../../providers/ToastProvider";
import type { Role } from "./tripLogic";

/**
 * Start trip for one handoff: the consent screen, then the browser's permission, then the trip. Resolves with what
 * happened so the caller can open the Trip screen (started) or, later, the "not sharing" fallback (declined / denied).
 */
export function useStartTrip(booking: BookingSummary, role: Role): (kind: HandoffKind) => Promise<StartTripResult> {
  const { requestStart } = useTrip();
  const { profile } = useSession();
  const toast = useToast();
  const otherName = role === "owner" ? booking.sitterName : booking.ownerName;

  return useCallback(
    async (kind) => {
      const from = profile ? await getMyHomePoint(profile.id, role).catch(() => null) : null;
      const result = await requestStart({ bookingId: booking.id, kind, otherName, from });
      if (result.started) toast.show(`Sharing your location with ${otherName}`);
      else if (result.reason === "error" && result.message) toast.show(result.message);
      return result;
    },
    [booking.id, otherName, profile, requestStart, role, toast],
  );
}
