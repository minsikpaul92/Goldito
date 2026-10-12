import { useCallback, useEffect, useId, useState } from "react";

import { getSupabase } from "../../lib/supabase";
import { listActiveTrips, listTrips } from "../../lib/transit";
import { Trip } from "../../types/db";

const POLL_MS = 4000;

/**
 * Keeps trips current without a refresh: a changed `trips` row arrives through Realtime (RLS-scoped to the two
 * people on the booking), and a short poll covers a missed event or a dropped socket — the same pair the inquiry
 * thread and the notifications use. `bookingId` omitted = every trip of mine that is running.
 */
export function useLiveTrips(bookingId?: string): { trips: Trip[] | null; reload: () => void } {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  // Two screens can watch the same booking at once; a channel name is shared, so each hook gets its own.
  const instance = useId();

  const reload = useCallback(() => {
    (bookingId ? listTrips(bookingId) : listActiveTrips()).then(setTrips).catch(() => undefined);
  }, [bookingId]);

  useEffect(() => {
    reload();
    const supabase = getSupabase();
    const channel = supabase
      .channel(`trips:${bookingId ?? "mine"}:${instance}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trips", ...(bookingId ? { filter: `booking_id=eq.${bookingId}` } : {}) },
        reload,
      )
      .subscribe();
    const poll = setInterval(reload, POLL_MS);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [bookingId, instance, reload]);

  return { trips, reload };
}
