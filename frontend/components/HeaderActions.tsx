import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { NotificationBell } from "./NotificationBell";
import { useSession } from "../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/**
 * Header right side for both roles: dev role label, notifications bell (Phase 05),
 * Schedule (sitters, 3B.1), Profile, Log out.
 */
export function HeaderActions() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { profile, signOut } = useSession();

  return (
    <View style={styles.row}>
      {__DEV__ && profile ? (
        <Text style={styles.roleLabel}>{profile.role === "owner" ? "Owner" : "Sitter"}</Text>
      ) : null}
      <NotificationBell />
      {profile?.role === "sitter" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Schedule"
          onPress={() => router.push("/sitter/schedule")}
          style={styles.iconButton}
          testID="open-schedule"
        >
          <Ionicons name="calendar-outline" size={theme.icon.sm} color={theme.color.primary} />
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile"
        onPress={() => router.push("/profile")}
        style={styles.iconButton}
        testID="open-profile"
      >
        <Ionicons name="person-circle-outline" size={theme.icon.md} color={theme.color.primary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={styles.logout}
        testID="log-out"
      >
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
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
      paddingVertical: 2,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.accent,
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.text,
    },
    iconButton: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    logout: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.xs,
    },
    logoutText: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.primary,
    },
  });
