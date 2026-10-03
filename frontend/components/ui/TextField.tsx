import { useState } from "react";
import { StyleSheet, TextInput, TextInputProps } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { Field } from "./Field";

type Props = Omit<TextInputProps, "style"> & {
  label: string;
  /** Read by screen readers but not drawn (when a group label already says it). */
  hideLabel?: boolean;
  hint?: string | null;
  error?: string | null;
  /** Bump on each submit attempt; the field shakes once if it has an error. */
  shakeKey?: number;
};

export function TextField({ label, hideLabel, hint, error, shakeKey, onFocus, onBlur, ...inputProps }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);

  return (
    <Field label={hideLabel ? undefined : label} hint={hint} error={error} shakeKey={shakeKey}>
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
    </Field>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    input: {
      minHeight: theme.layout.touchTarget,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
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
  });
