import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function Button({ label, onPress, disabled, style, testID }: Props) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      backgroundColor: theme.color.primary,
      paddingVertical: theme.spacing.sm + 4,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      alignItems: "center",
    },
    pressed: {
      opacity: 0.9,
    },
    disabled: {
      opacity: 0.5,
    },
    label: {
      color: theme.color.primaryText,
      fontSize: theme.fontSize.body,
      fontWeight: "600",
    },
  });
