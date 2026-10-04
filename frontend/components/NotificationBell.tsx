import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { useNotifications } from "../providers/NotificationsProvider";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/**
 * Header bell with unread badge (phase-05 5.4). Tap → notification center lands in 5.5.
 */
export function NotificationBell() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { unreadCount } = useNotifications();
  const label =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  return (
    <View accessibilityLabel={label} style={styles.wrap} testID="notification-bell">
      <Ionicons name="notifications-outline" size={theme.icon.sm} color={theme.color.textMuted} />
      {unreadCount > 0 ? (
        <View style={styles.badge} testID="notification-badge">
          <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.xs,
    },
    badge: {
      position: "absolute",
      top: 4,
      right: 4,
      minWidth: 16,
      height: 16,
      paddingHorizontal: 3,
      borderRadius: 8,
      backgroundColor: theme.color.error,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: theme.color.primaryText,
      lineHeight: 12,
    },
  });
