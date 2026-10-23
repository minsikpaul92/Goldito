import { StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { TextButton } from "./TextButton";

type Props = {
  label: string;
  value: string;
  /** Second line under the value ("3 nights", "Fri, Oct 9, 7:30 AM"). */
  detail?: string;
  /** Shows "Change" on the right. */
  onChange?: () => void;
  testID?: string;
};

/** A review line (design site: steps.html "Check your request"): label, value, and Change. Stack them with hairlines. */
export function SummaryRow({ label, value, detail, onChange, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.value}>
        <Text style={styles.valueText}>{value}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {onChange ? <TextButton label="Change" onPress={onChange} testID={testID ? `${testID}-change` : undefined} /> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      minHeight: 56,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    label: { width: 72, fontSize: theme.fontSize.small, color: theme.color.textMuted },
    value: { flex: 1, gap: 2 },
    valueText: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    detail: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
