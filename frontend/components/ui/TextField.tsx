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
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        // A hint, not a value: lighter than typed text.
        placeholderTextColor={theme.color.placeholder}
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
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.textMuted,
    },
    input: {
      minHeight: theme.layout.touchTarget,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
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
