import { Image, Platform, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

// Muk's gold tag logo (brand page, v2.1). The lockup is the light-background version of
// goldito-devpost-logo.svg: transparent, green wordmark.
const LOCKUP = require("../assets/brand/goldito-lockup-light.svg");
const ICON = require("../assets/brand/goldito-apple-touch-icon-180.png");
// viewBox of the lockup is 1168 × 412.
const LOCKUP_RATIO = 1168 / 412;

type Props = {
  /** Height of the logo in px. */
  height?: number;
  testID?: string;
};

/** The Goldito logo: the SVG lockup on web, the app icon + name on native (RN Image can't draw SVG). */
export function BrandLogo({ height = 28, testID }: Props) {
  const styles = useThemedStyles(makeStyles);

  if (Platform.OS === "web") {
    return (
      <Image
        source={LOCKUP}
        accessibilityLabel="Goldito"
        style={{ height, width: height * LOCKUP_RATIO }}
        resizeMode="contain"
        testID={testID}
      />
    );
  }
  return (
    <View style={styles.row} accessibilityLabel="Goldito" testID={testID}>
      <Image source={ICON} style={{ height, width: height, borderRadius: height / 4 }} />
      <Text style={[styles.name, { fontSize: height * 0.75 }]}>goldito</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    name: { fontWeight: theme.fontWeight.bold, color: theme.color.primary },
  });
