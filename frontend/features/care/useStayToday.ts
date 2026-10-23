import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { listOwnerBookings } from "../../lib/bookings";
import { listFeedPosts } from "../../lib/feed";
import { useNotifications } from "../../providers/NotificationsProvider";
import { useSession } from "../../providers/SessionProvider";
import { APP_TIMEZONE, appToday, daySpan, formatTime, isoToZoned, zonedToIso } from "../schedule/dates";
import { isCaring } from "../feed/caringPets";
import { listCareTasks, listTodayCheckins, listTodayTaskLogs } from "./careApi";

export type StayToday = {
  bookingId: string;
  sitterId: string;
  sitterName: string;
  pets: { id: string; name: string }[];
  /** Day N of M of the stay (app timezone). */
  day: number;
  days: number;
  /** "Picked up Fri 7:30 AM": null until the sitter has received the pets. */
  receivedLine: string | null;
  /**
   * Today's care: the checklist tasks (medication, meals, walks, litter, play, sleep) the sitter ticks off with a tap.
   * Total = tasks that fall inside this stay today (every daily one, plus any one-off already opened); done = the
   * ones the sitter completed. 0 of 0 when there are none (or they could not be read).
   */
  care: { done: number; total: number };
  /** Zero when nothing was logged (or it could not be read). */
  photos: number;
  walkMinutes: number;
};

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: APP_TIMEZONE });

/**
 * Owner Home: the stay in progress today (the same booking `useInCare` marks) and today's numbers for its pets.
 * Every number is read from what the sitter actually logged; one that is missing or can't be read is 0, never a guess.
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

      const [care, checkins, posts] = await Promise.all([
        Promise.all(
          pets.map(async (p) => {
            const [logs, tasks] = await Promise.all([listTodayTaskLogs(p.id), listCareTasks(p.id)]);
            // The sitter's day is opened (logs written) only when they open Home, so daily tasks count before that too.
            const logged = new Set(logs.map((l) => l.task_id));
            const from = Date.parse(booking.dropOff!.at);
            const to = Date.parse(booking.pickUp!.at);
            const planned = tasks.filter((t) => {
              if (!t.active || (!t.repeat_daily && !logged.has(t.id))) return false;
              const due = Date.parse(zonedToIso(today, t.scheduled_time.slice(0, 5)));
              return due >= from && due <= to;
            });
            const ids = new Set([...planned.map((t) => t.id), ...logged]);
            return { total: ids.size, done: logs.filter((l) => l.status === "done").length };
          }),
        ).catch(() => null),
        Promise.all(pets.map((p) => listTodayCheckins(p.id))).catch(() => null),
        Promise.all(pets.map((p) => listFeedPosts(p.id))).catch(() => null),
      ]);
      const walks = (checkins?.flat() ?? []).filter((c) => c.kind === "walk").reduce((sum, c) => sum + (Number(c.value) || 0), 0);
      setStay({
        bookingId: booking.id,
        sitterId: booking.sitterId,
        sitterName: booking.sitterName,
        pets,
        day,
        days,
        receivedLine,
        care: { done: care?.reduce((n, c) => n + c.done, 0) ?? 0, total: care?.reduce((n, c) => n + c.total, 0) ?? 0 },
        photos: posts ? posts.flat().filter((p) => p.media.resourceType === "image" && isoToZoned(p.createdAt).day === today).length : 0,
        walkMinutes: walks,
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
