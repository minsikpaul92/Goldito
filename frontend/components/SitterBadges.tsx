import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SitterBadge, listSitterBadges } from "../features/sitters/badgeApi";
import { formatDay, isoToZoned } from "../features/schedule/dates";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** Badges still to come: drawn as shadows so the shelf looks like it has more to earn. */
const LOCKED = 4;

/** The sitter's badge shelf on Profile (11.12): earned ones in color with the day, the rest grey, then locked shadows. */
export function SitterBadges({ sitterId }: { sitterId: string }) {
  const styles = useThemedStyles(makeStyles);
  const [badges, setBadges] = useState<SitterBadge[] | null>(null);

  useEffect(() => {
    let live = true;
    void listSitterBadges(sitterId)
      .then((list) => live && setBadges(list))
      .catch(() => live && setBadges([]));
    return () => {
      live = false;
    };
  }, [sitterId]);

  if (!badges) return null;
  return (
    <View style={styles.root} testID="sitter-badges">
      <Text style={styles.heading}>Badges</Text>
      <View style={styles.grid}>
        {badges.map((b) => (
          <View
            key={b.key}
            style={[styles.badge, b.at ? styles.earned : styles.notYet]}
            accessibilityLabel={b.at ? `${b.title}, earned` : `${b.title}, not yet`}
            testID={`badge-${b.key}`}
          >
            <Text style={[styles.emoji, !b.at && styles.faded]}>{b.emoji}</Text>
            <Text style={[styles.title, !b.at && styles.fadedText]} numberOfLines={2}>
              {b.title}
            </Text>
            <Text style={styles.when} testID={`badge-${b.key}-when`}>
              {b.at ? formatDay(isoToZoned(b.at).day) : "Not yet"}
            </Text>
          </View>
        ))}
        {Array.from({ length: LOCKED }, (_, i) => (
          <View key={i} style={[styles.badge, styles.locked]} accessibilityLabel="Coming soon" testID="badge-locked">
            <View style={styles.shadow}>
              <Text style={styles.lock}>🔒</Text>
            </View>
            <Text style={styles.when}>Soon</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.sm },
    heading: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    badge: {
      width: "31%",
      minHeight: 104,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.lg,
    },
    earned: { backgroundColor: theme.color.blockButter },
    notYet: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
    locked: { backgroundColor: theme.color.track },
    emoji: { fontSize: theme.icon.md },
    faded: { opacity: 0.3 },
    title: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text, textAlign: "center" },
    fadedText: { color: theme.color.textMuted },
    when: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    shadow: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.borderStrong,
      opacity: 0.35,
    },
    lock: { fontSize: theme.fontSize.small },
  });
