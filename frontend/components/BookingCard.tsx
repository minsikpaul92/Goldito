import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./ui/Icon";
import { formatDay, formatDayRange, formatInstant, formatTime, isoToZoned } from "../features/schedule/dates";
import { SPECIES_EMOJI } from "../features/pets/petFormat";
import { SERVICE_LABEL } from "../features/sitters/sitterApi";
import {
  BookingSummary,
  Handoff,
  LocationType,
  awaitingFirstYes,
  datesOnHold,
  meetGreetBlocksAccept,
  requestExpired,
} from "../lib/bookings";
import { Tag, TagTone } from "./ui/Tag";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type Viewer = "owner" | "sitter";

type Badge = { label: string; tone: TagTone };

/** Status badges per side (phase-03b screens table). Text always says it — never color alone. */
export function bookingBadges(b: BookingSummary, viewer: Viewer): Badge[] {
  if (b.status === "declined") return [{ label: "Declined", tone: "neutral" }];
  if (requestExpired(b)) return [{ label: "Expired", tone: "neutral" }];
  if (b.status === "cancelled") {
    return [{ label: "Cancelled", tone: "neutral" }];
  }
  if (b.status === "confirmed") {
    // The booking row stays "confirmed" for life; what happened at the handoffs says where the stay is (FB-26).
    if (b.pickUp?.completedAt) return [{ label: "Completed", tone: "success" }];
    const me = viewer === "owner" ? b.ownerId : b.sitterId;
    const open = [b.pending.drop_off, b.pending.pick_up].filter((p) => p !== null);
    const badges: Badge[] = [b.dropOff?.completedAt ? { label: "In care", tone: "success" } : { label: "Confirmed", tone: "success" }];
    if (open.some((p) => p.proposedBy !== me)) {
      badges.push({ label: `${viewer === "owner" ? b.sitterName : b.ownerName} suggested a change`, tone: "warning" });
    } else if (open.length > 0) {
      badges.push({ label: "Change pending", tone: "neutral" });
    }
    return badges;
  }

  // First-time pairs (D60): meet first → dates held while the Meet & Greet is arranged → the sitter confirms.
  const meetBadge = (): Badge | null => {
    if (awaitingFirstYes(b)) return { label: "Meet first", tone: "brand" };
    if (datesOnHold(b) && meetGreetBlocksAccept(b)) return { label: "Dates held · Meet & Greet", tone: "brand" };
    if (datesOnHold(b)) {
      return viewer === "sitter"
        ? { label: "Met, ready to confirm", tone: "warning" }
        : { label: `Waiting for ${b.sitterName} to confirm`, tone: "neutral" };
    }
    return null;
  };
  if (viewer === "owner") {
    const owner: Badge[] = [
      b.sitterSuggested ? { label: `Time suggested by ${b.sitterName}`, tone: "warning" } : { label: "Requested", tone: "brand" },
    ];
    const meet = meetBadge();
    if (meet) owner.push(meet);
    return owner;
  }
  const badges: Badge[] = [];
  if (b.sitterSuggested) badges.push({ label: `Waiting for ${b.ownerName}`, tone: "neutral" });
  const custom = [b.dropOff, b.pickUp].some((h) => h && h.pending && !h.withinSitterHours);
  if (custom && !b.sitterSuggested) badges.push({ label: "Custom time, needs your OK", tone: "warning" });
  const meet = meetBadge();
  if (meet) badges.push(meet);
  if (badges.length === 0) badges.push({ label: "New request", tone: "brand" });
  return badges;
}

/** Where a handoff happens, from the viewer's side — the address itself stays hidden (D31). */
export function placeLabel(type: LocationType, note: string | null, b: BookingSummary, viewer: Viewer): string {
  if (type === "other") return note ?? "Somewhere else";
  if (type === "sitter_home") return viewer === "sitter" ? "Your place" : `${b.sitterName}'s place`;
  return viewer === "owner" ? "My place" : `${b.ownerName}'s place`;
}

/**
 * Who drives, per D28 (place = transport), in one line (#181): "You drive both ways", "Chloe drives both ways", or the
 * two halves when they differ ("You drive over · Chloe brings them home"). House sitting has no drive: the sitter comes
 * to the owner's home.
 */
export function transportLine(b: BookingSummary, viewer: Viewer): string | null {
  if (b.serviceType === "house_sitting") {
    return viewer === "owner" ? `🔑 ${b.sitterName} cares for them at your place` : `🔑 You care for them at ${b.ownerName}'s place`;
  }
  const you = viewer === "owner" ? "You" : b.ownerName;
  const sitter = viewer === "sitter" ? "You" : b.sitterName;
  const s = (who: string, verb: string) => `${who} ${verb}${who === "You" ? "" : "s"}`;
  // at the sitter's place the owner drives (to leave or to fetch); at the owner's the sitter comes; "other" = meet
  const driver = (h: Handoff | null) => (!h ? null : h.locationType === "other" ? "meet" : h.locationType === "sitter_home" ? you : sitter);
  const d = driver(b.dropOff), p = driver(b.pickUp);
  if (d && d === p) return d === "meet" ? "Meet halfway both ways" : `${s(d, "drive")} both ways`;
  const half = (kind: "drop_off" | "pick_up", who: string | null) => {
    if (!who) return null;
    if (who === "meet") return kind === "drop_off" ? "Meet for drop-off" : "Meet for pick-up";
    if (kind === "drop_off") return who === you ? s(you, "drive") + " over" : s(sitter, "pick") + " up";
    return who === you ? s(you, "pick") + " up" : `${s(sitter, "bring")} them home`;
  };
  const parts = [half("drop_off", d), half("pick_up", p)].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Dates and the place once (#181): "Oct 19, 6:00 PM to 8:00 PM at Chloe's place", or "Oct 19 to 21 at Chloe's place"
 * over several days. The place is where the pets stay (the sitter's for boarding, home for house sitting); how they get
 * there and back is the who-drives line.
 */
export function stayLine(b: BookingSummary, viewer: Viewer): string | null {
  const first = b.dropOff ?? b.pickUp, last = b.pickUp ?? b.dropOff;
  if (!first || !last) return null;
  const a = isoToZoned(first.at), z = isoToZoned(last.at);
  const when = a.day === z.day ? `${formatDay(a.day)}, ${formatTime(a.time)} to ${formatTime(z.time)}` : formatDayRange(a.day, z.day);
  const where = placeLabel(b.serviceType === "house_sitting" ? "owner_home" : "sitter_home", null, b, viewer);
  return `${when} at ${where}`;
}

export function handoffLine(label: string, h: Handoff | null, b: BookingSummary, viewer: Viewer): string {
  if (!h) return `${label}: not set`;
  const done = h.completedAt
    ? ` · ✓ ${label === "Drop-off" ? "Received" : "Returned"} ${formatTime(isoToZoned(h.completedAt).time)}`
    : "";
  return `${label} ${formatInstant(h.at)} · ${placeLabel(h.locationType, h.note, b, viewer)}${done}`;
}

type Props = {
  booking: BookingSummary;
  viewer: Viewer;
  onPress?: () => void;
};

/** Booking row (past stays): the other person, pets, status badges, then two lines: when and where, and who drives (#181). */
export function BookingCard({ booking, viewer, onPress }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const badges = bookingBadges(booking, viewer);
  const pets = booking.pets.map((p) => `${SPECIES_EMOJI[p.species]} ${p.name}`).join("  ");
  const who = viewer === "owner" ? booking.sitterName : booking.ownerName;
  // the handoffs that happened ride on the who-drives line: "✓ Received 9:30 AM", "✓ Returned 5:00 PM"
  const done = booking.pickUp?.completedAt
    ? `✓ Returned ${formatTime(isoToZoned(booking.pickUp.completedAt).time)}`
    : booking.dropOff?.completedAt
      ? `✓ Received ${formatTime(isoToZoned(booking.dropOff.completedAt).time)}`
      : null;
  const transport = [transportLine(booking, viewer), done].filter(Boolean).join(" · ") || null;
  const stay = stayLine(booking, viewer);

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={`booking-card-${booking.id}`}
    >
      <View style={styles.body}>
        <Text style={styles.who}>{who}</Text>
        <View style={styles.badges}>
          {badges.map((badge) => (
            <Tag key={badge.label} label={badge.label} tone={badge.tone} />
          ))}
        </View>
        {pets ? <Text style={styles.pets}>{`${pets}  ·  ${SERVICE_LABEL[booking.serviceType]}`}</Text> : null}
        {stay ? (
          <Text style={styles.line} testID={`stay-${booking.id}`}>
            {stay}
          </Text>
        ) : null}
        {transport ? (
          <Text style={styles.line} testID={`transport-${booking.id}`}>
            {transport}
          </Text>
        ) : null}
      </View>
      {onPress ? <Icon name="forward" size={theme.icon.sm} color={theme.color.textMuted} /> : null}
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    pressed: {
      opacity: 0.8,
    },
    body: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    who: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    badges: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    pets: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    line: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
  });
