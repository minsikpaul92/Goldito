import { StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** A centred label between two rules: "or with email", "or try the demo". */
export function OrDivider({ label }: { label: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <View style={styles.rule} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rule} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    rule: { flex: 1, height: 1, backgroundColor: theme.color.border },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
  });
