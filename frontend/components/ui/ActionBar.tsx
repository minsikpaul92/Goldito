import { Children, ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/**
 * Buttons side by side at equal widths, for `Screen`'s `footer` with `footerSolid` (a sticky action bar: Undo,
 * Start over, Save). Put the one primary Button last.
 */
export function ActionBar({ children, testID }: { children: ReactNode; testID?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bar} testID={testID}>
      {Children.map(children, (child) => (child ? <View style={styles.slot}>{child}</View> : null))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: { flexDirection: "row", gap: theme.spacing.sm },
    slot: { flex: 1, minWidth: 0 },
  });
