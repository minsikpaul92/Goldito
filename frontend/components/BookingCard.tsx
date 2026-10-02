import { StyleSheet, Text, View } from "react-native";

import { formatInstant } from "../features/schedule/dates";
import { SPECIES_EMOJI } from "../features/pets/petFormat";
import { Handoff, LocationType, OwnerBooking } from "../lib/bookings";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Badge = { label: string; tone: "info" | "warning" | "success" | "muted" };

/** Owner-side status badge (phase-03b screens table). */
export function ownerBadge(b: OwnerBooking): Badge {
  if (b.status === "confirmed") return { label: "Confirmed", tone: "success" };
  if (b.status === "declined") return { label: "Declined", tone: "muted" };
  if (b.status === "cancelled") return { label: "Cancelled — find a new sitter", tone: "muted" };
  if (b.sitterSuggested) return { label: `Time suggested by ${b.sitterName}`, tone: "warning" };
  return { label: "Requested", tone: "info" };
}

/** "Mina's place" / "My place" / the note — the address itself stays hidden (D31). */
export function placeLabel(type: LocationType, note: string | null, sitterName: string): string {
  if (type === "sitter_home") return `${sitterName}'s place`;
  if (type === "owner_home") return "My place";
  return note ?? "Somewhere else";
}

function handoffLine(label: string, h: Handoff | null, sitterName: string): string {
  if (!h) return `${label}: —`;
  return `${label} ${formatInstant(h.at)} · ${placeLabel(h.locationType, h.note, sitterName)}`;
}

/** Owner booking row: sitter, pets, drop-off / pick-up, status badge (never color alone — text says it). */
export function BookingCard({ booking }: { booking: OwnerBooking }) {
  const styles = useThemedStyles(makeStyles);
  const badge = ownerBadge(booking);
  const pets = booking.pets.map((p) => `${SPECIES_EMOJI[p.species]} ${p.name}`).join("  ");

  return (
    <View style={styles.card} testID={`booking-card-${booking.id}`}>
      <View style={styles.header}>
        <Text style={styles.sitter}>{booking.sitterName}</Text>
        <View style={[styles.badge, styles[`badge_${badge.tone}`]]}>
          <Text style={[styles.badgeText, styles[`badgeText_${badge.tone}`]]}>{badge.label}</Text>
        </View>
      </View>
      {pets ? <Text style={styles.pets}>{pets}</Text> : null}
      <Text style={styles.line}>{handoffLine("Drop-off", booking.dropOff, booking.sitterName)}</Text>
      <Text style={styles.line}>{handoffLine("Pick-up", booking.pickUp, booking.sitterName)}</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      gap: theme.spacing.xs,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    sitter: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    pets: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    line: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    badge: {
      flexShrink: 1,
      paddingVertical: 2,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
    },
    badge_info: {
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    badge_warning: {
      borderColor: theme.color.warning,
      backgroundColor: theme.color.surface,
    },
    badge_success: {
      borderColor: theme.color.success,
      backgroundColor: theme.color.surface,
    },
    badge_muted: {
      borderColor: theme.color.border,
      backgroundColor: theme.color.background,
    },
    badgeText: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
    },
    badgeText_info: {
      color: theme.color.primary,
    },
    badgeText_warning: {
      color: theme.color.warning,
    },
    badgeText_success: {
      color: theme.color.success,
    },
    badgeText_muted: {
      color: theme.color.textMuted,
    },
  });
