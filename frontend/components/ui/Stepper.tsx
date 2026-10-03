import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { PressableScale } from "./PressableScale";

type Props = {
  /** Read by screen readers with the buttons: "Morning start earlier". */
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease?: boolean;
  canIncrease?: boolean;
  /** Words after the label for the − and + buttons. */
  actions?: [string, string];
  testID?: string;
};

/** − value + for times and counts: the web-safe stand-in for native pickers (DESIGN.md §7.7). */
export function Stepper({
  label,
  value,
  onDecrease,
  onIncrease,
  canDecrease = true,
  canIncrease = true,
  actions = ["earlier", "later"],
  testID,
}: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const button = (icon: "remove" | "add", onPress: () => void, enabled: boolean, name: string, id: string) => (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label} ${name}`}
      disabled={!enabled}
      onPress={onPress}
      style={[styles.button, !enabled && styles.disabled]}
      testID={testID ? `${testID}-${id}` : undefined}
    >
      <Ionicons name={icon} size={theme.icon.sm} color={theme.color.primary} />
    </PressableScale>
  );

  return (
    <View style={styles.row}>
      {button("remove", onDecrease, canDecrease, actions[0], "minus")}
      <Text style={styles.value} testID={testID ? `${testID}-value` : undefined}>
        {value}
      </Text>
      {button("add", onIncrease, canIncrease, actions[1], "plus")}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    button: {
      width: theme.layout.touchTarget,
      height: theme.layout.touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    disabled: {
      opacity: 0.4,
    },
    value: {
      minWidth: 84,
      textAlign: "center",
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
  });
