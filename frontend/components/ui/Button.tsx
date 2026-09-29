import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

import { tokens } from "../../theme/tokens";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, disabled, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
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

const styles = StyleSheet.create({
  base: {
    backgroundColor: tokens.color.primary,
    paddingVertical: tokens.spacing.sm + 4,
    paddingHorizontal: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    alignItems: "center",
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: tokens.color.primaryText,
    fontSize: tokens.fontSize.body,
    fontWeight: "600",
  },
});
