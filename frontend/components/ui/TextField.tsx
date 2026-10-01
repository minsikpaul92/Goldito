import { useState } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = Omit<TextInputProps, "style"> & {
  label: string;
  error?: string | null;
};

export function TextField({ label, error, onFocus, onBlur, ...inputProps }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.color.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, focused && styles.inputFocused, error ? styles.inputError : null]}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    field: {
      gap: theme.spacing.xs,
    },
    label: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.textMuted,
    },
    input: {
      minHeight: 44,
      paddingVertical: theme.spacing.sm + 2,
      paddingHorizontal: theme.spacing.sm + 4,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    inputFocused: {
      borderColor: theme.color.primary,
    },
    inputError: {
      borderColor: theme.color.error,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
  });
