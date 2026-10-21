import Ionicons from "@expo/vector-icons/Ionicons";
import { ComponentProps } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { Sheet } from "./ui/Sheet";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type PlusItem = {
  id: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  /** Off = shown dimmed: it cannot be sent right now. */
  enabled: boolean;
  onPress: () => void;
};

type Props = { visible: boolean; items: PlusItem[]; onClose: () => void };

/** The + beside the message box (#235): cards a person can send by hand. Each one opens the same sheet or card the flow does. */
export function ChatPlusMenu({ visible, items, onClose }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Sheet visible={visible} title="Send a card" onClose={onClose} testID="chat-plus-menu">
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityState={{ disabled: !item.enabled }}
          disabled={!item.enabled}
          onPress={() => {
            onClose();
            item.onPress();
          }}
          style={[styles.row, !item.enabled && styles.off]}
          testID={`chat-plus-${item.id}`}
        >
          <Ionicons name={item.icon} size={20} color={theme.color.primary} />
          <Text style={styles.label}>{item.label}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
    off: { opacity: 0.4 },
    label: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
