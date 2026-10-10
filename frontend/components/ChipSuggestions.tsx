import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ReportChip } from "../features/diary/reportApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  chips: ReportChip[];
  /** Ids of the chips switched off. */
  off: Set<string>;
  onToggle: (id: string) => void;
  /** Removes a chip the sitter added themselves (source "custom"); suggested chips are only turned off (D38). */
  onRemove?: (id: string) => void;
  testIDPrefix: string;
};

/** The day's chips as on/off toggles (D38): what stays on is what the report may talk about. */
export function ChipSuggestions({ chips, off, onToggle, onRemove, testIDPrefix }: Props) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap}>
      {chips.map((chip) => {
        const on = !off.has(chip.id);
        const removable = onRemove && chip.source === "custom";
        return (
          <View key={chip.id} style={[styles.chip, on && styles.chipOn, removable && styles.chipRemovable]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${chip.label}: ${on ? "on" : "off"}`}
              aria-pressed={on}
              onPress={() => onToggle(chip.id)}
              style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
              testID={`${testIDPrefix}-${chip.id}`}
            >
              <Text style={[styles.text, on && styles.textOn]}>{`${chip.source === "vision" ? "📷 " : ""}${on ? "✓ " : ""}${chip.label}`}</Text>
            </Pressable>
            {removable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${chip.label}`}
                onPress={() => onRemove(chip.id)}
                hitSlop={6}
                style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                testID={`${testIDPrefix}-${chip.id}-remove`}
              >
                <Text style={[styles.removeText, on && styles.textOn]}>×</Text>
              </Pressable>
            ) : null}
          </View>
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
      flexDirection: "row",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      alignItems: "center",
    },
    chipOn: { borderColor: theme.color.primary, backgroundColor: theme.color.accent },
    chipRemovable: { paddingRight: 0 },
    toggle: { minHeight: 44, paddingHorizontal: theme.spacing.md, alignItems: "center", justifyContent: "center" },
    remove: { minWidth: 36, minHeight: 44, alignItems: "center", justifyContent: "center", marginLeft: -theme.spacing.sm },
    removeText: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.textMuted },
    pressed: { opacity: 0.6 },
    text: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    textOn: { color: theme.color.primary },
  });
