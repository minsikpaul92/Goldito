import { useEffect, useRef } from "react";
import { Animated, Image, Platform, StyleSheet, Text, View } from "react-native";

import { PawWalk } from "./PawWalk";
import { useReduceMotion } from "../ui/useReduceMotion";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

// The coin fills about 60% of its square canvas (see BrandLogo), so the image is drawn larger than the coin we want.
const SYMBOL = Platform.OS === "web" ? require("../../assets/brand/goldito-symbol.svg") : require("../../assets/brand/goldito-symbol-256.png");
const COIN = 52;
const SYMBOL_SCALE = 1.6;

/**
 * What the app shows while it finds out who is signed in: the paw walk with the coin and the name under it,
 * instead of a bare spinner (intro trial: Boot). Finish uses the same walk with the welcome instead of the logo.
 */
export function BootView() {
  const styles = useThemedStyles(makeStyles);
  const reduce = useReduceMotion();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      rise.setValue(1);
      return;
    }
    const show = Animated.timing(rise, { toValue: 1, duration: 450, delay: 900, useNativeDriver: false });
    show.start();
    return () => show.stop();
  }, [reduce, rise]);

  const size = COIN * SYMBOL_SCALE;
  return (
    <View style={styles.container} accessibilityLabel="Loading Goldito" testID="boot">
      <PawWalk />
      <Animated.View
        style={[
          styles.logo,
          { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
        ]}
      >
        <Image source={SYMBOL} style={{ width: size, height: size, margin: -(size - COIN) / 2 }} resizeMode="contain" />
        <Text style={styles.name}>Goldito</Text>
      </Animated.View>
    </View>
  );
}

const makeStyles = (theme: Theme) => {
  const display = theme.fontFamily.display;
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      backgroundColor: theme.color.cream,
    },
    logo: { alignItems: "center", gap: theme.spacing.sm },
    // The display file carries its own weight; a fontWeight on top would fake-bold it.
    name: {
      fontSize: theme.fontSize.title + 6,
      color: theme.color.primary,
      ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.bold }),
    },
  });
};
