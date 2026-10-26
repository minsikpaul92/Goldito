import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  /** "Booking request". */
  flow: string;
  step: number;
  total: number;
  onBack?: () => void;
  /** Right-side help link: "Ask Chloe". */
  help?: { label: string; onPress: () => void };
  testID?: string;
};

/**
 * Top of every one-question-per-screen flow (design site: steps.html; onboarding #115): back, a green progress bar,
 * "Booking request · 1 of 6" and an optional help link. One look for booking, onboarding and sitter setup.
 */
export function StepHeader({ flow, step, total, onBack, help, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const pct = Math.max(0, Math.min(1, step / total));
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.top}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={theme.spacing.sm} style={styles.back} testID={testID ? `${testID}-back` : undefined}>
            <Icon name="arrowBack" size={24} color={theme.color.text} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <View style={styles.mid}>
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={step}
            accessibilityLabel={`${flow}, step ${step} of ${total}`}
          >
            <View style={[styles.fill, { width: `${pct * 100}%` }]} />
          </View>
          <Text style={styles.label}>{`${flow} · ${step} of ${total}`}</Text>
        </View>
        {help ? (
          <Pressable accessibilityRole="link" onPress={help.onPress} hitSlop={theme.spacing.sm}>
            <Text style={styles.help}>{help.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { paddingVertical: theme.spacing.sm },
    top: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    // The ← arrow alone, 44 px, read aloud as Back: one look for every Back (U1).
    back: { width: 44, height: 44, justifyContent: "center" },
    mid: { flex: 1, gap: theme.spacing.xs },
    track: { height: 8, borderRadius: 4, backgroundColor: theme.color.border, overflow: "hidden" },
    fill: { height: 8, borderRadius: 4, backgroundColor: theme.color.success },
    label: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    help: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.primary },
  });
