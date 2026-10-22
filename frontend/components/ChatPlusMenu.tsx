import { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, IconName } from "./ui/Icon";
import { Sheet } from "./ui/Sheet";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type PlusItem = {
  id: string;
  label: string;
  icon: IconName;
  /** Off = shown dimmed: it cannot be sent right now. */
  enabled: boolean;
  /** Why it is off, in a few words ("From 8:00 PM"), shown under a dimmed entry (#250). */
  hint?: string;
  onPress: () => void;
};

type Props = { visible: boolean; items: PlusItem[]; onClose: () => void };

/** The + beside the message box (#235): cards a person can send by hand. Each one opens the same sheet or card the flow does. */
export function ChatPlusMenu({ visible, items, onClose }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Sheet visible={visible} title="Send a card" onClose={onClose} testID="chat-plus-menu">
      <View style={styles.list}>
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
            <Icon name={item.icon} size={20} color={theme.color.primary} />
            <Text style={styles.label}>{item.label}</Text>
            {!item.enabled && item.hint ? (
              <Text style={styles.hint} testID={`chat-plus-${item.id}-hint`}>
                {item.hint}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Rows sit closer than the sheet's own spacing: five or six entries still fit without scrolling.
    list: { gap: theme.spacing.xs },
    row: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
    off: { opacity: 0.4 },
    label: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted, marginLeft: "auto" },
  });
