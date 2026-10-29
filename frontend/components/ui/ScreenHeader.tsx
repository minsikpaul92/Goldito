import { ReactNode } from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  title: string;
  subtitle?: string;
  /** Icons or a small button on the right. */
  right?: ReactNode;
  style?: ViewStyle;
  testID?: string;
};

/** Large in-page title (Expressive: Fredoka) with an optional subtitle and right-side slots. */
export function ScreenHeader({ title, subtitle, right, style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.row, style]} testID={testID}>
      <View style={styles.text}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

/** The small line under a pushed screen's header ("← Title" in the stack header), at the top of the page. */
export function ScreenSubtitle({ children, testID }: { children: ReactNode; testID?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={styles.subtitle} testID={testID}>
      {children}
    </Text>
  );
}

const makeStyles = (theme: Theme) => {
  const display = theme.fontFamily.display;
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    text: { flex: 1, minWidth: 0, gap: 2 },
    title: {
      color: theme.color.text,
      fontSize: theme.fontSize.title + 4,
      lineHeight: theme.fontSize.title + 12,
      // The display file carries its own weight; a fontWeight on top would fake-bold it.
      ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.bold }),
    },
    subtitle: { color: theme.color.textMuted, fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small },
    right: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  });
};
