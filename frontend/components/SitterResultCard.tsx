import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { tokens } from "../theme/tokens";
import { Avatar } from "./ui/Avatar";
import { Icon } from "./ui/Icon";

type Props = {
  name: string;
  /** Cover photo url, or nothing for the initial. */
  photo?: string | null;
  /** After the distance on the facts line: "5 yrs exp". */
  meta?: string | null;
  /** Last part of the facts line: "2 km". */
  km: string;
  /** Whole dollars per night for the searched service, or null when the sitter hasn't set a rate. */
  nightly: number | null;
  favorite?: boolean;
  /** Average review (1–5) and finished stays, once the search returns them (backend request in the design site's 10-22 doc). */
  rating?: number | null;
  stays?: number | null;
  /** "Free on your dates" (free) or "Full on Oct 24" (not free), from the slot calendar. */
  availability?: { free: boolean; label: string } | null;
  onOpen: () => void;
  onPhoto?: () => void;
  testID: string;
};

/**
 * A sitter in search results (design site master: qa-sitter-card.html). Photo, name, one line of facts, price big on the right.
 * The whole card opens the profile; no chevron. Rating, stays and availability join the facts line once the search returns them.
 */
export function SitterResultCard({ name, photo, meta, km, nightly, favorite, rating, stays, availability, onOpen, onPhoto, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Stays say "trusted" in a few characters; experience is the fallback for new sitters (one short line, no ellipsis).
  // The rating sits next to the name, and only when the sitter has reviews.
  const facts = stays != null ? `${stays} ${stays === 1 ? "stay" : "stays"}` : meta ?? "";
  const avatar = photo ? <Avatar kind="photo" uri={photo} size={52} /> : <Avatar kind="initial" name={name} size={52} />;
  return (
    <View style={styles.card}>
      {onPhoto ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${name}'s photos`} onPress={onPhoto} testID={`sitter-avatar-${name}`}>
          {avatar}
        </Pressable>
      ) : (
        avatar
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[favorite ? `${name}, favorite` : name, rating != null ? `rated ${rating.toFixed(1)}` : null, facts, meta && facts !== meta ? meta : null, km, availability?.label, nightly != null ? `$${nightly} per night` : null].filter(Boolean).join(", ")}
        onPress={onOpen}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        testID={testID}
      >
        <View style={styles.body}>
          <View style={styles.nameRow}>
            {favorite ? <Icon name="heart" filled size={14} color={theme.color.primary} testID={`sitter-heart-${name}`} /> : null}
            <Text style={styles.name} numberOfLines={1}>
              {name}
              {rating != null ? <Text style={styles.rating} testID={`sitter-rating-${name}`}>{`  ★ ${rating.toFixed(1)}`}</Text> : null}
            </Text>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            <Text testID={`sitter-km-${name}`}>{km}</Text>
            {facts ? ` · ${facts}` : ""}
          </Text>
          {availability ? (
            <View style={[styles.avail, availability.free ? styles.free : styles.full]}>
              <Text style={[styles.availText, availability.free ? styles.freeText : styles.fullText]}>{availability.label}</Text>
            </View>
          ) : null}
        </View>
        {nightly != null ? (
          <View style={styles.price}>
            <Text style={styles.amount}>{`$${nightly}`}</Text>
            <Text style={styles.per}>per night</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.color.surface,
    },
    main: { flex: 1, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: theme.layout.touchTarget },
    pressed: { opacity: theme.motion.pressOpacity },
    body: { flex: 1, gap: 2 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    name: { flexShrink: 1, fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    meta: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    // Gold on a light ground (brand page), never faded.
    rating: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: tokens.color.goldOnLight },
    price: { alignItems: "flex-end" },
    avail: { alignSelf: "flex-start", marginTop: 2, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: 2 },
    free: { backgroundColor: theme.color.successSurface },
    full: { backgroundColor: theme.color.warningSurface },
    availText: { fontSize: theme.fontSize.caption, fontWeight: theme.fontWeight.bold },
    freeText: { color: theme.color.success },
    fullText: { color: theme.color.warning },
    amount: {
      fontFamily: theme.fontFamily.display,
      fontSize: theme.fontSize.option,
      lineHeight: theme.lineHeight.option,
      fontWeight: theme.fontFamily.display ? undefined : theme.fontWeight.bold,
      color: theme.color.text,
    },
    per: { fontSize: theme.fontSize.caption, color: theme.color.textMuted },
  });
