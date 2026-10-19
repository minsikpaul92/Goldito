import { StyleSheet, View } from "react-native";

import { HeaderMenu } from "./HeaderMenu";
import { NotificationBell } from "./NotificationBell";
import { Tag } from "./ui/Tag";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** Header right side for both roles (#147): role chip, bell, menu (Profile, Schedule, Settings, Log out). */
export function HeaderActions() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();

  return (
    <View style={styles.row}>
      {profile ? (
        <Tag label={profile.role === "owner" ? "Owner" : "Sitter"} tone="brand" style={styles.chip} testID="role-chip" />
      ) : null}
      <NotificationBell />
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
  });
