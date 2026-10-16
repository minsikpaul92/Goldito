import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  /** What matched: allergens, toxic ingredients — shown as white chips on the red. */
  chips?: string[];
  /** The only way out (DESIGN.md §7.4). */
  actionLabel: string;
  onAcknowledge: () => void;
  busy?: boolean;
  testID?: string;
};

/**
 * DANGER is loud (DESIGN.md §7.4): a full-screen `error` red that is not a sheet — no backdrop tap,
 * no X, Escape / Android back do nothing; it closes only through its one button. `error` is a fixed
 * status color, so no pet skin can soften it. Inside the desktop frame it stays in the phone (iframe).
 */
export function AlertModal({ visible, title, message, chips = [], actionLabel, onAcknowledge, busy, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const id = (suffix: string) => (testID ? `${testID}-${suffix}` : undefined);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => undefined}>
      <View accessibilityRole="alert" accessibilityViewIsModal style={styles.root} testID={testID}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
            ⚠️
          </Text>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.message} testID={id("message")}>
            {message}
          </Text>
          {chips.length > 0 ? (
            <View style={styles.chips}>
              {chips.map((chip) => (
                <View key={chip} style={styles.chip} testID={id("chip")}>
                  <Text style={styles.chipLabel}>{chip}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          {/* White on red: the shared Button's skin colors would not read here. */}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onAcknowledge}
            style={({ pressed }) => [styles.button, (pressed || busy) && styles.pressed]}
            testID={id("acknowledge")}
          >
            <Text style={styles.buttonLabel}>{busy ? "Saving…" : actionLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.error },
    body: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: theme.spacing.md,
      padding: theme.spacing.lg,
    },
    icon: { fontSize: theme.icon.hero * 1.5 },
    title: { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.color.surface, textAlign: "center" },
    message: { fontSize: theme.fontSize.body, color: theme.color.surface, textAlign: "center", lineHeight: theme.lineHeight.body },
    chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: theme.spacing.sm },
    chip: {
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm + 4,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.color.surface,
    },
    chipLabel: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.error },
    footer: { padding: theme.spacing.lg },
    button: {
      alignItems: "center",
      paddingVertical: theme.spacing.sm + 4,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      backgroundColor: theme.color.surface,
    },
    pressed: { opacity: 0.8 },
    buttonLabel: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.error },
  });
