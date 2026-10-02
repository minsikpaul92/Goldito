import { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { TextButton } from "./TextButton";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling body — the sheet's one primary action. */
  footer?: ReactNode;
  testID?: string;
};

/**
 * Bottom sheet with a visible Close; tapping the backdrop closes it too. No drag to
 * dismiss (DESIGN.md §6 Sheet, §7.7). Inside the desktop frame it stays in the phone,
 * because the app runs in the frame's iframe.
 */
export function Sheet({ visible, title, onClose, children, footer, testID }: Props) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID={testID ? `${testID}-backdrop` : undefined}
        />
        <View accessibilityViewIsModal style={styles.sheet} testID={testID}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <TextButton label="Close" onPress={onClose} testID={testID ? `${testID}-close` : undefined} />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: theme.color.overlay,
    },
    sheet: {
      maxHeight: "90%",
      width: "100%",
      maxWidth: 480,
      alignSelf: "center",
      backgroundColor: theme.color.surface,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingLeft: theme.spacing.md,
      paddingRight: theme.spacing.xs,
      paddingTop: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.color.border,
    },
    title: {
      flex: 1,
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    body: {
      padding: theme.spacing.md,
      gap: theme.spacing.md,
    },
    footer: {
      padding: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
  });
