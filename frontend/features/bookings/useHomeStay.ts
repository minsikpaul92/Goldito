import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { OwnerBooking, homeStay, listOwnerBookings } from "../../lib/bookings";
import { useOnBookingChange } from "../../providers/NotificationsProvider";
import { useSession } from "../../providers/SessionProvider";

/**
 * The owner's stay for Home's ticket (in care now, else the next paid one), reloaded when Home comes into view and
 * when a booking changes, like the Bookings tab. Null while loading, on an error, or with nothing paid.
 */
export function useHomeStay(): OwnerBooking | null {
  const { profile } = useSession();
  const ownerId = profile?.role === "owner" ? profile.id : undefined;
  const [stay, setStay] = useState<OwnerBooking | null>(null);

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      setStay(homeStay(await listOwnerBookings(ownerId)));
    } catch {
      // Home still works without the ticket; the Bookings tab shows the error.
    }
  }, [ownerId]);

  useOnBookingChange(() => void load());
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return stay;
}
