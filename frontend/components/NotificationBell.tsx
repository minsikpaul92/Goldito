import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useNotifications } from "../providers/NotificationsProvider";
import { useSession } from "../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/**
 * Header bell with unread badge. Tap opens the role's notification center (5.5).
 */
export function NotificationBell() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const { unreadCount } = useNotifications();
  const label =
    unreadCount > 0 ? `Notifications, ${unreadCount} new` : "Notifications";

  const openCenter = () => {
    if (profile?.role === "owner") router.push("/owner/notifications");
    else if (profile?.role === "sitter") router.push("/sitter/notifications");
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={openCenter}
      style={styles.wrap}
      testID="notification-bell"
    >
      <Ionicons name="notifications-outline" size={24} color={theme.color.text} />
      {unreadCount > 0 ? (
        <View style={styles.badge} testID="notification-badge">
          <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
        </View>
      ) : null}
    </Pressable>
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
      top: 3,
      right: 2,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: theme.ui.chrome,
      backgroundColor: theme.color.error,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: {
      fontSize: 10,
      fontWeight: theme.fontWeight.bold,
      color: theme.color.primaryText,
      lineHeight: 12,
    },
  });
