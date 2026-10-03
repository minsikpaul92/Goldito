import { ReactNode } from "react";
import { Animated, StyleSheet, Text } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { useShake } from "./motion";

type Props = {
  label?: string;
  /** Helper copy under the control. */
  hint?: string | null;
  error?: string | null;
  /** Bump on each submit attempt; the field shakes once if it has an error. */
  shakeKey?: number;
  children: ReactNode;
  testID?: string;
};

/** One form field: label → control → hint → error, always the same rhythm. */
export function Field({ label, hint, error, shakeKey, children, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const shake = useShake(shakeKey, !!error);

  return (
    <Animated.View style={[styles.field, shake]} testID={testID}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </Animated.View>
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
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
  });
