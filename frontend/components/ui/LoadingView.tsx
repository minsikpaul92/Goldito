import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

/** Full-screen spinner while the session or a screen's data loads. */
export function LoadingView() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container} accessibilityLabel="Loading">
      <ActivityIndicator color={theme.color.primary} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.background,
    },
  });
