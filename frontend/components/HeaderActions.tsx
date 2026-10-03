import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { useSession } from "../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { PressableScale } from "./ui/PressableScale";

/**
 * Header right side for both roles: dev role label, notifications bell (Phase 05),
 * Schedule (sitters, 3B.1), Profile. Log out lives in Profile.
 */
export function HeaderActions() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();

  return (
    <View style={styles.row}>
      {__DEV__ && profile ? (
        <Text style={styles.roleLabel}>{profile.role === "owner" ? "Owner" : "Sitter"}</Text>
      ) : null}
      {/* Notification center arrives in Phase 05; the bell keeps its place in the header. */}
      <View accessibilityLabel="Notifications (coming soon)" style={styles.bell}>
        <Ionicons name="notifications-outline" size={theme.icon.sm} color={theme.color.textMuted} />
      </View>
      {profile?.role === "sitter" ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Schedule"
          onPress={() => router.push("/sitter/schedule")}
          style={styles.iconButton}
          testID="open-schedule"
        >
          <Ionicons name="calendar-outline" size={theme.icon.sm} color={theme.color.primary} />
        </PressableScale>
      ) : null}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Profile"
        onPress={() => router.push("/profile")}
        style={styles.iconButton}
        testID="open-profile"
      >
        <Ionicons name="person-circle-outline" size={theme.icon.md} color={theme.color.primary} />
      </PressableScale>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingRight: theme.spacing.md,
    },
    roleLabel: {
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.accent,
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.text,
    },
    bell: {
      padding: theme.spacing.xs,
    },
    iconButton: {
      minWidth: theme.layout.touchTarget,
      minHeight: theme.layout.touchTarget,
      alignItems: "center",
      justifyContent: "center",
    },
  });
