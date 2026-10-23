import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { listOwnerBookings } from "../../lib/bookings";
import { listFeedPosts } from "../../lib/feed";
import { useNotifications } from "../../providers/NotificationsProvider";
import { useSession } from "../../providers/SessionProvider";
import { APP_TIMEZONE, appToday, daySpan, formatTime, isoToZoned } from "../schedule/dates";
import { isCaring } from "../feed/caringPets";
import { listTodayCheckins, listTodayTaskLogs } from "./careApi";

export type StayToday = {
  bookingId: string;
  sitterName: string;
  pets: { id: string; name: string }[];
  /** Day N of M of the stay (app timezone). */
  day: number;
  days: number;
  /** "Picked up Fri 7:30 AM": null until the sitter has received the pets. */
  receivedLine: string | null;
  /** Null when there are no tasks today (or they could not be read): the tile and bar stay hidden. */
  care: { done: number; total: number } | null;
  photos: number | null;
  /** Null when no walk was logged today (cats, or none yet). */
  walkMinutes: number | null;
};

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: APP_TIMEZONE });

/**
 * Owner Home: the stay in progress today (the same booking `useInCare` marks) and today's numbers for its pets.
 * Every number is read from what the sitter actually logged; one that can't be read is null, never a guess.
 */
export function useStayToday(): StayToday | null {
  const session = useSession();
  const ownerId = session.status === "signedIn" ? session.profile.id : null;
  const { inboxRevision } = useNotifications();
  const [stay, setStay] = useState<StayToday | null>(null);

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      const bookings = await listOwnerBookings(ownerId);
      const booking = bookings.find((b) => isCaring(b) && b.pickUp);
      if (!booking || !booking.dropOff || !booking.pickUp) return setStay(null);
      const pets = booking.pets.flatMap((p) => (p.id ? [{ id: p.id, name: p.name }] : []));
      const today = appToday();
      const start = isoToZoned(booking.dropOff.at).day;
      const days = Math.max(1, daySpan(start, isoToZoned(booking.pickUp.at).day));
      const day = Math.min(days, Math.max(1, daySpan(start, today)));

      const received = booking.dropOff.completedAt;
      const receivedLine = received
        ? `${booking.dropOff.locationType === "owner_home" ? "Picked up" : "Dropped off"} ${weekday.format(new Date(received))} ${formatTime(isoToZoned(received).time)}`
        : null;

      const [logs, checkins, posts] = await Promise.all([
        Promise.all(pets.map((p) => listTodayTaskLogs(p.id))).catch(() => null),
        Promise.all(pets.map((p) => listTodayCheckins(p.id))).catch(() => null),
        Promise.all(pets.map((p) => listFeedPosts(p.id))).catch(() => null),
      ]);
      const allLogs = logs?.flat() ?? [];
      const walks = (checkins?.flat() ?? []).filter((c) => c.kind === "walk").reduce((sum, c) => sum + (Number(c.value) || 0), 0);
      setStay({
        bookingId: booking.id,
        sitterName: booking.sitterName,
        pets,
        day,
        days,
        receivedLine,
        care: allLogs.length > 0 ? { done: allLogs.filter((l) => l.status === "done").length, total: allLogs.length } : null,
        photos: posts ? posts.flat().filter((p) => p.media.resourceType === "image" && isoToZoned(p.createdAt).day === today).length : null,
        walkMinutes: walks > 0 ? walks : null,
      });
    } catch {
      // The hero is a bonus; Home works without it.
    }
  }, [ownerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // A new sitter update changes today's numbers.
  useEffect(() => {
    if (inboxRevision > 0) void load();
  }, [inboxRevision, load]);

  return stay;
}
