import { Image, Platform, StyleSheet, Text, View } from "react-native";

import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

// The pixel gold coin symbol (master SVG). Native gets the PNG (RN Image can't draw SVG).
const SYMBOL = Platform.OS === "web" ? require("../assets/brand/goldito-symbol.svg") : require("../assets/brand/goldito-symbol-256.png");
// The coin fills about 60% of its square canvas; the image is drawn larger so the coin matches the text.
const SYMBOL_SCALE = 1.6;

type Props = {
  /** Height of the logo in px. */
  height?: number;
  testID?: string;
};

/** The Goldito logo: the gold coin symbol + the name. */
export function BrandLogo({ height = 28, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const size = height * SYMBOL_SCALE;
  return (
    <View style={styles.row} accessible accessibilityRole="image" accessibilityLabel="Goldito" testID={testID}>
      <Image source={SYMBOL} style={{ width: size, height: size, margin: -(size - height) / 2 }} resizeMode="contain" />
      <Text style={[styles.name, { fontSize: height * 0.8, lineHeight: height }]}>Goldito</Text>
    </View>
  );
}

const makeStyles = (theme: Theme) => {
  const display = theme.fontFamily.display;
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    // The display file carries its own weight; a fontWeight on top would fake-bold it.
    name: { color: theme.color.primary, ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.bold }) },
  });
};
