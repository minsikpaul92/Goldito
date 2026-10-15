import { useCallback, useEffect, useId, useState } from "react";

import { getSupabase } from "../../lib/supabase";
import { isLive, listActiveTrips, listTrips } from "../../lib/transit";
import { Trip } from "../../types/db";

/** While a trip runs, the position and ETA change every few seconds. */
const LIVE_POLL_MS = 4000;
/** With nothing running, Realtime announces a start; this slow poll only covers a missed event (CR-9). */
const IDLE_POLL_MS = 15_000;

/**
 * Keeps trips current without a refresh: a changed `trips` row arrives through Realtime (RLS-scoped to the two
 * people on the booking), and a poll covers a missed event or a dropped socket — the same pair the inquiry thread
 * and the notifications use. The poll is quick only while a trip is live. `bookingId` omitted = every trip of mine
 * that is running. `enabled = false` (a booking that can have no trip) reads nothing at all.
 */
export function useLiveTrips(bookingId?: string, enabled = true): { trips: Trip[] | null; reload: () => void } {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  // Two screens can watch the same booking at once; a channel name is shared, so each hook gets its own.
  const instance = useId();
  const live = !!trips?.some(isLive);

  const reload = useCallback(() => {
    (bookingId ? listTrips(bookingId) : listActiveTrips()).then(setTrips).catch(() => undefined);
  }, [bookingId]);

  useEffect(() => {
    if (!enabled) {
      setTrips([]);
      return;
    }
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
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bookingId, enabled, instance, reload]);

  useEffect(() => {
    if (!enabled) return;
    const poll = setInterval(reload, live ? LIVE_POLL_MS : IDLE_POLL_MS);
    return () => clearInterval(poll);
  }, [enabled, live, reload]);

  return { trips, reload };
}
