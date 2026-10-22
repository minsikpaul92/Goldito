import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { HeaderMenu } from "./HeaderMenu";
import { NotificationBell } from "./NotificationBell";
import { ProfileAvatar } from "./ProfileAvatar";
import { Tag } from "./ui/Tag";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** Header right side for both roles (#147, #287): role chip, bell, account photo, menu (Profile, Schedule, Settings, Log out). */
export function HeaderActions() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();

  return (
    <View style={styles.row}>
      {profile ? (
        <Tag label={profile.role === "owner" ? "Owner" : "Sitter"} tone="brand" style={styles.chip} testID="role-chip" />
      ) : null}
      <NotificationBell />
      {profile ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${profile.displayName || "You"}, Profile`}
          onPress={() => router.push("/profile")}
          style={styles.avatarButton}
          testID="header-profile-avatar"
        >
          <ProfileAvatar
            profileId={profile.id}
            name={profile.displayName || "You"}
            size={30}
            testID="header-avatar"
          />
        </Pressable>
      ) : null}
      <HeaderMenu />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      paddingRight: theme.spacing.sm,
    },
    chip: { alignSelf: "center", marginRight: theme.spacing.xs },
    avatarButton: {
      minWidth: 34,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 2,
    },
  });
