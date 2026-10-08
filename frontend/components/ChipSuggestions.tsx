import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ReportChip } from "../features/diary/reportApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  chips: ReportChip[];
  /** Ids of the chips switched off. */
  off: Set<string>;
  onToggle: (id: string) => void;
  testIDPrefix: string;
};

/** The day's chips as on/off toggles (D38): what stays on is what the report may talk about. */
export function ChipSuggestions({ chips, off, onToggle, testIDPrefix }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap}>
      {chips.map((chip) => {
        const on = !off.has(chip.id);
        return (
          <Pressable
            key={chip.id}
            accessibilityRole="button"
            accessibilityLabel={`${chip.label}: ${on ? "on" : "off"}`}
            aria-pressed={on}
            onPress={() => onToggle(chip.id)}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
            testID={`${testIDPrefix}-${chip.id}`}
          >
            <Text style={[styles.text, on && styles.textOn]}>{`${chip.source === "vision" ? "📷 " : ""}${on ? "✓ " : ""}${chip.label}`}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    chip: {
      minHeight: 44,
      paddingHorizontal: theme.spacing.md,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    chipOn: { borderColor: theme.color.primary, backgroundColor: theme.color.accent },
    pressed: { opacity: 0.6 },
    text: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    textOn: { color: theme.color.primary },
  });
