import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { listOwnerBookings } from "../../lib/bookings";
import { useSession } from "../../providers/SessionProvider";
import { ChangeRequest, getLatestChangeRequest } from "./carePlanApi";

export type PetStay = { sitterName: string; bookingId: string };

export type PetStayState =
  | { status: "loading" }
  | { status: "ready"; stay: PetStay | null; request: ChangeRequest | null };

/**
 * Is this pet in an accepted stay that is not over yet? Then the owner **sends a request** to the
 * sitter; before that (or after) they simply write the checklist. Also the newest request, for its status.
 */
export function usePetStay(petId: string) {
  const session = useSession();
  const ownerId = session.status === "signedIn" ? session.profile.id : null;
  const [state, setState] = useState<PetStayState>({ status: "loading" });

  const reload = useCallback(async () => {
    if (!ownerId) return;
    try {
      const [bookings, request] = await Promise.all([listOwnerBookings(ownerId), getLatestChangeRequest(petId)]);
      const booking = bookings.find(
        (b) => b.status === "confirmed" && b.pets.some((p) => p.id === petId) && !b.pickUp?.completedAt,
      );
      setState({
        status: "ready",
        stay: booking ? { sitterName: booking.sitterName, bookingId: booking.id } : null,
        request,
      });
    } catch {
      // Fall back to the plain checklist: the screen must stay usable.
      setState({ status: "ready", stay: null, request: null });
    }
  }, [ownerId, petId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { state, reload };
}
