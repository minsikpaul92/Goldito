import { Pressable, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Avatar } from "./ui/Avatar";

type Props = {
  name: string;
  /** Cover photo url, or nothing for the initial. */
  photo?: string | null;
  /** First part of the facts line: "5 yrs experience". */
  meta?: string | null;
  /** Last part of the facts line: "2 km". */
  km: string;
  /** Whole dollars per night for the searched service, or null when the sitter hasn't set a rate. */
  nightly: number | null;
  favorite?: boolean;
  onOpen: () => void;
  onPhoto?: () => void;
  testID: string;
};

/**
 * A sitter in search results (design site master: qa-sitter-card.html). Photo, name, one line of facts, price big on the right.
 * The whole card opens the profile; no chevron. Rating, stays and availability join the facts line once the search returns them.
 */
export function SitterResultCard({ name, photo, meta, km, nightly, favorite, onOpen, onPhoto, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
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
        accessibilityLabel={[name, meta, km, nightly != null ? `$${nightly} per night` : null].filter(Boolean).join(", ")}
        onPress={onOpen}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        testID={testID}
      >
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {favorite ? `★ ${name}` : name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta ? `${meta} · ` : ""}
            <Text testID={`sitter-km-${name}`}>{km}</Text>
          </Text>
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
    name: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    meta: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    price: { alignItems: "flex-end" },
    amount: {
      fontFamily: theme.fontFamily.display,
      fontSize: theme.fontSize.option,
      lineHeight: theme.lineHeight.option,
      fontWeight: theme.fontFamily.display ? undefined : theme.fontWeight.bold,
      color: theme.color.text,
    },
    per: { fontSize: theme.fontSize.caption, color: theme.color.textMuted },
  });
