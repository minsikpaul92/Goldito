import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
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
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const id = (suffix: string) => (testID ? `${testID}-${suffix}` : undefined);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => undefined}>
      <View accessibilityRole="alert" accessibilityViewIsModal style={styles.root} testID={testID}>
        {/* Figma 1673:44181: a red band says DANGER at a glance; the cream body keeps the details readable (audit F26). */}
        <View style={styles.band}>
          <View style={styles.badge}>
            <Ionicons name="warning" size={34} color={theme.color.error} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
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
    root: { flex: 1, backgroundColor: theme.color.background },
    band: {
      alignItems: "center",
      gap: theme.spacing.md,
      paddingTop: theme.spacing.xl * 2,
      paddingBottom: theme.spacing.xl,
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.color.error,
    },
    badge: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.color.surface, alignItems: "center", justifyContent: "center" },
    title: { fontSize: theme.fontSize.title, lineHeight: theme.lineHeight.title, fontWeight: theme.fontWeight.bold, color: theme.color.surface, textAlign: "center" },
    body: { flexGrow: 1, alignItems: "center", gap: theme.spacing.md, padding: theme.spacing.lg },
    message: { fontSize: theme.fontSize.body, color: theme.color.text, textAlign: "center", lineHeight: theme.lineHeight.body },
    chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: theme.spacing.sm },
    chip: {
      minHeight: 32,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      borderColor: theme.color.error,
      backgroundColor: theme.color.errorSurface,
    },
    chipLabel: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.error },
    footer: { padding: theme.spacing.lg },
    button: {
      minHeight: 60,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.error,
    },
    pressed: { opacity: theme.motion.pressOpacity },
    buttonLabel: { fontSize: theme.fontSize.lead, fontWeight: theme.fontWeight.bold, color: theme.color.surface },
  });
