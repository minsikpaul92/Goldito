import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { PressableScale } from "./PressableScale";

type Props = {
  label: string;
  /** Second line, e.g. the slot's current hours. */
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** One-of-many choice (radio semantics and icon) instead of a checkbox. */
  radio?: boolean;
  disabled?: boolean;
  testID?: string;
};

/** Checkbox (or radio) with its label as one big click target. */
export function CheckRow({ label, hint, checked, onChange, radio, disabled, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <PressableScale
      accessibilityRole={radio ? "radio" : "checkbox"}
      // react-native-web ignores accessibilityState.checked; aria-checked reaches the DOM.
      aria-checked={checked}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(radio ? true : !checked)}
      style={[styles.row, disabled && styles.disabled]}
      testID={testID}
    >
      <Ionicons
        name={radio ? (checked ? "radio-button-on" : "radio-button-off") : checked ? "checkbox" : "square-outline"}
        size={theme.icon.sm}
        color={checked ? theme.color.primary : theme.color.textMuted}
      />
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </PressableScale>
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
    disabled: {
      opacity: 0.5,
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
