import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  label: string;
  /** Second line, e.g. the slot's current hours. */
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testID?: string;
};

/** Checkbox with its label as one big click target. */
export function CheckRow({ label, hint, checked, onChange, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="checkbox"
      // react-native-web ignores accessibilityState.checked; aria-checked reaches the DOM.
      aria-checked={checked}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.row}
      testID={testID}
    >
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={theme.icon.sm}
        color={checked ? theme.color.primary : theme.color.textMuted}
      />
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    text: {
      flex: 1,
    },
    label: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
  });
