import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  label: string;
  /** Shows a remove button (allergy editing). */
  onRemove?: () => void;
  testID?: string;
};

export function Chip({ label, onRemove, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.chip} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          onPress={onRemove}
          hitSlop={theme.spacing.sm}
          style={styles.remove}
        >
          <Ionicons name="close" size={theme.fontSize.small} color={theme.color.textMuted} />
        </Pressable>
      ) : null}
    </View>
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
    remove: {
      padding: 2,
    },
  });
