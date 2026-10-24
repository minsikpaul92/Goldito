import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  label: string;
  /** Second line, e.g. the slot's current hours. */
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** One-of-many choice (radio semantics and icon) instead of a checkbox. */
  radio?: boolean;
  disabled?: boolean;
  /** A favorite sitter: the same filled heart as the sitter's page, after the name. */
  favorite?: boolean;
  testID?: string;
};

/** Checkbox (or radio) with its label as one big click target. */
export function CheckRow({ label, hint, checked, onChange, radio, disabled, favorite, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole={radio ? "radio" : "checkbox"}
      // react-native-web ignores accessibilityState.checked; aria-checked reaches the DOM.
      aria-checked={checked}
      accessibilityLabel={favorite ? `${label}, favorite` : label}
      disabled={disabled}
      onPress={() => onChange(radio ? true : !checked)}
      style={[styles.row, disabled && styles.disabled]}
      testID={testID}
    >
      <Icon
        name={radio ? (checked ? "radioOn" : "radioOff") : checked ? "checkboxOn" : "checkboxOff"}
        size={theme.icon.sm}
        color={checked ? theme.color.primary : theme.color.textMuted}
      />
      <View style={styles.text}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {favorite ? <Icon name="heart" filled size={14} color={theme.color.primary} /> : null}
        </View>
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
    disabled: {
      opacity: theme.opacity.disabled,
    },
    labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    label: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
  });
