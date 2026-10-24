import { Pressable, StyleSheet, Text, View } from "react-native";

import { Art } from "./art/Art";
import { HOME_TEXT } from "./home/homeType";
import { Icon, IconName } from "./ui/Icon";
import { Tag } from "./ui/Tag";
import { Viewer, bookingBadges } from "./BookingCard";
import { APP_TIMEZONE, formatDay, formatTime, isoToZoned } from "../features/schedule/dates";
import { BookingSummary, BookingStage, Handoff } from "../lib/bookings";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { tokens } from "../theme/tokens";

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: APP_TIMEZONE });

/** The five steps of a stay (Figma "stages"): ask, meet, book, care, home. */
const STEPS = ["Ask", "Meet", "Book", "Care", "Home"] as const;

/** Which step the stay is on: the ones before are done, the ones after are still to come. */
function stepOf(stage: BookingStage): number {
  switch (stage) {
    case "requested":
      return 0;
    case "meet_greet":
      return 1;
    case "confirm":
    case "awaiting_payment":
      return 2;
    case "paid":
    case "in_care":
      return 3;
    default:
      return 4;
  }
}

const dayLabel = (h: Handoff | null) => (h ? formatDay(isoToZoned(h.at).day).toUpperCase() : "TBD");
const timeLabel = (h: Handoff) => `${weekday.format(new Date(h.at))} ${formatTime(isoToZoned(h.at).time)}${h.completedAt ? " ✓" : ""}`;

/** Who drives, from the viewer's side ("you drive", "Chloe picks up", "meet halfway"). */
function whoLine(kind: "drop_off" | "pick_up", h: Handoff, b: BookingSummary, viewer: Viewer): string {
  const label = kind === "drop_off" ? "Drop-off" : "Pick-up";
  if (h.locationType === "other") return `${label} · meet`;
  const owner = viewer === "owner" ? "you" : b.ownerName;
  const sitter = viewer === "sitter" ? "you" : b.sitterName;
  const verb = (who: string, base: string) => (who === "you" ? base : `${base}s`);
  // At the sitter's place the owner drives there (to leave or to fetch); at the owner's the sitter comes (D28).
  const driver = h.locationType === "sitter_home" ? owner : sitter;
  return `${label} · ${driver} ${verb(driver, "drive")}`;
}

type Props = { booking: BookingSummary; viewer: Viewer; onPress?: () => void };

/**
 * A stay on the Bookings tab, for both sides (Figma 1730:103907): who it is with, the pets, drop-off → pick-up as big
 * dates, where it is in the five steps, the two handoffs, and what was paid. The status tags keep the details a step
 * pill can't say ("Waiting for Chloe", "suggested a change").
 */
export function BookingTicket({ booking, viewer, onPress }: Props) {
  const styles = useThemedStyles(makeStyles);
  const step = stepOf(booking.stage);
  const other = viewer === "owner" ? booking.sitterName : booking.ownerName;
  const service = booking.serviceType === "house_sitting" ? "House sitting" : "Boarding";
  const kicker = viewer === "owner" ? (booking.serviceType === "house_sitting" ? `${service} by ${other}` : `${service} at ${other}'s`) : `${service} · ${other}`;
  const names = booking.pets.map((p) => p.name).join(" & ");
  const rows: { icon: IconName; text: string; at: string | null }[] = [];
  if (booking.serviceType !== "house_sitting") {
    if (booking.dropOff) rows.push({ icon: "car", text: whoLine("drop_off", booking.dropOff, booking, viewer), at: timeLabel(booking.dropOff) });
    if (booking.pickUp) rows.push({ icon: "place", text: whoLine("pick_up", booking.pickUp, booking, viewer), at: timeLabel(booking.pickUp) });
  } else {
    rows.push({ icon: "place", text: viewer === "owner" ? `${other} cares for them at your place` : `You care for them at ${other}'s place`, at: null });
  }
  const price = booking.priceSnapshot;
  const total = price ? `$${price.total.toFixed(2)} ${price.currency}` : null;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={`booking-card-${booking.id}`}
    >
      <View style={styles.top}>
        <View style={styles.topText}>
          <Text style={styles.kicker} numberOfLines={1}>
            {kicker}
          </Text>
          <Text style={styles.pets} numberOfLines={2}>
            {names}
          </Text>
        </View>
        <Art name="bookings/house" size={76} />
      </View>

      <View style={styles.dates}>
        <View>
          <Text style={styles.dateLabel}>DROP-OFF</Text>
          <Text style={styles.date}>{dayLabel(booking.dropOff)}</Text>
        </View>
        <Text style={styles.arrow}>→</Text>
        <View>
          <Text style={styles.dateLabel}>PICK-UP</Text>
          <Text style={styles.date}>{dayLabel(booking.pickUp)}</Text>
        </View>
      </View>

      <View style={styles.steps}>
        {STEPS.map((label, i) => (
          <View key={label} style={[styles.step, i < step ? styles.stepDone : i === step ? styles.stepNow : styles.stepNext]}>
            <Text style={[styles.stepText, i < step ? styles.stepTextDone : i === step ? styles.stepTextNow : null]}>{i < step ? `✓ ${label}` : label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.tags}>
        {bookingBadges(booking, viewer).map((badge) => (
          <Tag key={badge.label} label={badge.label} tone={badge.tone} />
        ))}
      </View>

      <View style={styles.rule} />
      {rows.map((row) => (
        <View key={row.text} style={styles.kv}>
          <View style={styles.kvLeft}>
            <Icon name={row.icon} size={15} color={tokens.color.text} />
            <Text style={styles.kvText} numberOfLines={1}>
              {row.text}
            </Text>
          </View>
          {row.at ? <Text style={styles.kvStrong}>{row.at}</Text> : null}
        </View>
      ))}
      <View style={styles.kv}>
        <Text style={styles.kvMuted}>{booking.paidAt ? "Paid" : "Not paid yet"}</Text>
        {total ? <Text style={styles.kvStrong}>{total}</Text> : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: 12, padding: 18, borderRadius: 28, backgroundColor: tokens.color.blockPeach },
    pressed: { opacity: 0.9 },
    top: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
    topText: { flex: 1, gap: 6 },
    // Figma #8A5A00 on peach; the brand "gold on light" token is the nearest.
    kicker: { fontSize: HOME_TEXT.small, lineHeight: 16.8, fontWeight: "800", letterSpacing: 0.72, textTransform: "uppercase", color: tokens.color.goldOnLight },
    pets: { fontSize: HOME_TEXT.name, lineHeight: 23.8, fontWeight: "800", letterSpacing: -0.17, color: theme.color.text },
    dates: { flexDirection: "row", alignItems: "center", gap: 10 },
    dateLabel: { fontSize: HOME_TEXT.kicker, lineHeight: 11, fontWeight: "800", letterSpacing: 0.88, color: theme.color.textMuted },
    date: {
      ...(theme.fontFamily.display ? { fontFamily: theme.fontFamily.display } : null),
      fontSize: HOME_TEXT.date,
      lineHeight: 34,
      fontWeight: theme.fontWeight.bold,
      letterSpacing: -0.34,
      color: theme.color.text,
    },
    arrow: { fontSize: HOME_TEXT.hero, color: tokens.color.goldOnLight },
    steps: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
    step: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
    stepDone: { backgroundColor: "#52B788" }, // tokens-ok: Figma step done
    stepNow: { backgroundColor: theme.color.text },
    stepNext: { backgroundColor: "rgba(255,255,255,0.7)" },
    stepText: { fontSize: HOME_TEXT.chip - 1.5, lineHeight: 16.1, fontWeight: theme.fontWeight.bold, color: theme.color.textMuted },
    stepTextDone: { color: "#0B2A1C" }, // tokens-ok: Figma step done text
    stepTextNow: { color: theme.color.primaryText },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    rule: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(27,67,50,0.15)" },
    kv: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    kvLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
    kvText: { flexShrink: 1, fontSize: 13.5, lineHeight: 18.9, color: theme.color.text }, // tokens-ok: Figma Bookings line
    kvMuted: { fontSize: 13.5, lineHeight: 18.9, color: theme.color.textMuted }, // tokens-ok: Figma Bookings line
    kvStrong: { fontSize: 13.5, lineHeight: 18.9, fontWeight: "800", color: theme.color.text }, // tokens-ok: Figma Bookings line
  });
