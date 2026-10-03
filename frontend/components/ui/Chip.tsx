import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { AppearIn } from "./AppearIn";
import { PressableScale } from "./PressableScale";

type Props = {
  label: string;
  /** Shows a remove button (allergy editing). */
  onRemove?: () => void;
  /** Just added: pops in once. */
  justAdded?: boolean;
  testID?: string;
};

export function Chip({ label, onRemove, justAdded = false, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <AppearIn enabled={justAdded} pop style={styles.chip} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      {onRemove ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          onPress={onRemove}
          hitSlop={theme.spacing.sm}
        >
          <Ionicons name="close" size={theme.fontSize.small} color={theme.color.textMuted} />
        </PressableScale>
      ) : null}
    </AppearIn>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    label: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
  });
