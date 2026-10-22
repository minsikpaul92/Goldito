import Ionicons from "@expo/vector-icons/Ionicons";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Trailing = { kind: "chevron" } | { kind: "switch"; value: boolean; onChange: (v: boolean) => void } | { kind: "badge"; text: string } | { kind: "none" };

type Props = {
  title: string;
  /** Second line (two-line row). */
  detail?: string;
  leading?: ReactNode;
  trailing?: Trailing;
  /** Destructive action (Sign out, Delete): red title, no chevron. */
  danger?: boolean;
  onPress?: () => void;
  testID?: string;
};

/**
 * Figma Expressive List Row (1673:31755): settings and menus. A row that goes somewhere has a chevron; a switch row
 * toggles in place; a danger row is red. Rows sit in a white group card with hairlines between them (ListGroup).
 */
export function ListRow({ title, detail, leading, trailing = { kind: "chevron" }, danger, onPress, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const body = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <Text style={[styles.title, danger && styles.danger]}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {trailing.kind === "chevron" && !danger ? <Ionicons name="chevron-forward" size={20} color={theme.color.textMuted} /> : null}
      {trailing.kind === "badge" ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{trailing.text}</Text>
        </View>
      ) : null}
      {trailing.kind === "switch" ? (
        <Switch
          value={trailing.value}
          onValueChange={trailing.onChange}
          accessibilityLabel={title}
          trackColor={{ true: theme.color.primary, false: theme.color.border }}
          thumbColor={theme.color.surface}
        />
      ) : null}
    </>
  );
  if (trailing.kind === "switch" || !onPress) {
    return (
      <View style={[styles.row, detail ? styles.two : null]} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.row, detail ? styles.two : null, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

/** White group card for ListRows, with hairlines between rows. */
export function ListGroup({ children, testID }: { children: ReactNode; testID?: string }) {
  const styles = useThemedStyles(makeStyles);
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={styles.group} testID={testID}>
      {items.map((child, i) => (
        <View key={i} style={i > 0 ? styles.divider : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    group: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, overflow: "hidden" },
    divider: { borderTopWidth: 1, borderTopColor: theme.color.border },
    row: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: theme.spacing.md, paddingHorizontal: theme.spacing.md },
    two: { minHeight: 64, paddingVertical: theme.spacing.sm },
    pressed: { backgroundColor: theme.color.background },
    leading: { width: 32, alignItems: "center" },
    body: { flex: 1, gap: 2 },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    detail: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    danger: { color: theme.color.error },
    badge: { backgroundColor: theme.color.gold, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: 2 },
    badgeText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.text },
  });
