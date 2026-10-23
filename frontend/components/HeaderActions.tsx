import { StyleSheet, View } from "react-native";

import { HeaderMenu } from "./HeaderMenu";
import { NotificationBell } from "./NotificationBell";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** Header right side for both roles (#147): bell, then your avatar, which opens the menu (Profile, Schedule, Settings, Log out). */
export function HeaderActions() {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.row}>
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
  });
