import { Children, Fragment, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { tokens } from "../../theme/tokens";
import { Theme } from "../../theme/themes";

type ListProps = { children: ReactNode; testID?: string };

/** Figma: Goldito-Design → Settings → list. A white rounded group of ListRows with a hairline between them. */
export function List({ children, testID }: ListProps) {
  const styles = useThemedStyles(makeStyles);
  const rows = Children.toArray(children);
  return (
    <View style={styles.list} testID={testID}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={styles.divider} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  /** A small gold pill before the chevron (e.g. "3 new"). */
  badge?: string;
  /** Red title, no chevron (Sign out). */
  tone?: "danger";
  /** Show the chevron. Unset = a chevron only when the row is tappable. */
  chevron?: boolean;
  /** Set to show an on/off switch; the whole row toggles it. */
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  onPress?: () => void;
  testID?: string;
};

/** Figma: Goldito-Design → Settings → List Row (Lines, Trailing, Tone). */
export function ListRow({ title, subtitle, badge, tone, chevron, switchValue, onSwitchChange, onPress, testID }: RowProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isSwitch = switchValue !== undefined;
  const showChevron = !isSwitch && tone !== "danger" && (chevron ?? Boolean(onPress));
  const handlePress = isSwitch ? () => onSwitchChange?.(!switchValue) : onPress;

  const content = (
    <>
      <View style={styles.text}>
        <Text style={[styles.title, tone === "danger" && styles.danger]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{badge}</Text>
        </View>
      ) : null}
      {showChevron ? <Icon name="forward" size={theme.icon.sm} color={theme.color.text} /> : null}
      {isSwitch ? (
        <View style={[styles.track, switchValue && styles.trackOn]}>
          <View style={[styles.knob, switchValue ? styles.knobOn : styles.knobOff]} />
        </View>
      ) : null}
    </>
  );

  if (!handlePress) {
    return (
      <View style={styles.row} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole={isSwitch ? "switch" : "button"}
      aria-checked={isSwitch ? switchValue : undefined}
      accessibilityLabel={title}
      onPress={handlePress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.ui.radius.block,
      overflow: "hidden",
    },
    divider: { height: 1, backgroundColor: theme.color.border },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      minHeight: 54,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 13,
    },
    pressed: { opacity: theme.opacity.pressed },
    text: { flex: 1, minWidth: 0, gap: 1 },
    title: { fontSize: 15, lineHeight: 21, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    danger: { color: theme.color.error },
    subtitle: { fontSize: 12.5, lineHeight: 17.5, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    badge: {
      backgroundColor: tokens.color.gold,
      borderRadius: theme.ui.radius.tag,
      paddingHorizontal: 9,
      paddingVertical: 2,
    },
    badgeLabel: { fontSize: 11.5, lineHeight: 16, fontWeight: "800", color: theme.color.text },
    track: { width: 42, height: 26, borderRadius: 13, backgroundColor: theme.color.track, justifyContent: "center" },
    trackOn: { backgroundColor: tokens.color.primary },
    knob: { position: "absolute", width: 20, height: 20, borderRadius: 10, backgroundColor: tokens.color.surface },
    knobOn: { right: 3 },
    knobOff: { left: 3 },
  });
