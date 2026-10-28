import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { ReportChip } from "../features/diary/reportApi";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { selectable } from "./ui/selectable";

type Props = {
  chips: ReportChip[];
  /** Ids of the chips switched off. */
  off: Set<string>;
  onToggle: (id: string) => void;
  /** Removes a chip the sitter added themselves (source "custom"); suggested chips are only turned off (D38). */
  onRemove?: (id: string) => void;
  testIDPrefix: string;
};

/** A spinner and a line while the chips are being made from a photo. */
export function ChipsReading({ testID }: { testID?: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.reading} accessibilityRole="progressbar" accessibilityLabel="Reading the photo" testID={testID}>
      <ActivityIndicator color={theme.color.primary} />
      <Text style={styles.readingText}>Reading the photo…</Text>
    </View>
  );
}

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
    // A chip is never wider than the row and a long line wraps inside it (Sitter-013): the chip, its toggle and its
    // text may all shrink. Small text keeps more chips on a line; the height stays a full touch target.
    chip: { ...selectable(theme).chip, paddingHorizontal: 0, maxWidth: "100%", flexShrink: 1 },
    chipOn: selectable(theme).chipOn,
    chipRemovable: { paddingRight: 0 },
    toggle: {
      flexShrink: 1,
      minWidth: 0,
      minHeight: theme.layout.touchTarget,
      paddingHorizontal: theme.spacing.sm + 4,
      paddingVertical: 6,
      justifyContent: "center",
    },
    remove: { flexShrink: 0, minWidth: 36, minHeight: 44, alignItems: "center", justifyContent: "center", marginLeft: -theme.spacing.sm },
    removeText: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.textMuted },
    pressed: { opacity: 0.6 },
    reading: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, minHeight: theme.layout.touchTarget },
    readingText: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    text: { ...selectable(theme).label, flexShrink: 1, fontSize: theme.fontSize.small },
    textOn: selectable(theme).labelOn,
  });
