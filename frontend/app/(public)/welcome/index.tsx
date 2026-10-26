import { router } from "expo-router";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, ImageSourcePropType, StyleSheet, Text, View } from "react-native";

import { BrandLogo } from "../../../components/BrandLogo";
import { DemoSheet } from "../../../components/intro/DemoSheet";
import { SocialSignIn } from "../../../components/intro/SocialSignIn";
import { Button } from "../../../components/ui/Button";
import { Icon } from "../../../components/ui/Icon";
import { Screen } from "../../../components/ui/Screen";
import { TextButton } from "../../../components/ui/TextButton";
import { useReduceMotion } from "../../../components/ui/useReduceMotion";
import { DEFAULT_DEMO_SET, isDemoEnabled } from "../../../lib/demo";
import { useTheme, useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

const MAX = require("../../../assets/welcome/max.png");
const MOCHI = require("../../../assets/welcome/mochi.png");
const STICKERS: { src: ImageSourcePropType; size: number; at: object; delay: number; tilt?: string }[] = [
  { src: require("../../../assets/stickers/star.png"), size: 26, at: { left: 12, top: 10 }, delay: 0, tilt: "-12deg" },
  { src: require("../../../assets/stickers/heart.png"), size: 26, at: { left: 118, top: 66 }, delay: 600 },
  { src: require("../../../assets/stickers/ball.png"), size: 24, at: { right: 150, bottom: 14 }, delay: 1200 },
  { src: require("../../../assets/stickers/sun.png"), size: 30, at: { right: 124, top: 44 }, delay: 300 },
];

/**
 * Welcome (OB.1, intro trial on the design site): Max and Mochi, the tagline, and Try the demo as the main button,
 * then email sign-up and Log in. How it works opens three short pages.
 */
export default function WelcomeLanding() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [demoOpen, setDemoOpen] = useState(false);
  const { sitter, pets } = DEFAULT_DEMO_SET;

  const footer = (
    <View style={styles.footer}>
      {isDemoEnabled ? (
        <Button label="Try the demo" onPress={() => setDemoOpen(true)} testID="welcome-demo" />
      ) : (
        <Button label="Create account" onPress={() => router.push("/signup")} testID="welcome-create" />
      )}
      <SocialSignIn testID="welcome-social" />
      <View style={styles.links}>
        <TextButton label="Sign up with email" onPress={() => router.push("/signup")} testID="welcome-sign-up" />
        <TextButton label="Log in" onPress={() => router.push("/login")} testID="welcome-sign-in" />
      </View>
    </View>
  );

  return (
    <View style={styles.root} testID="welcome">
      <Screen contentStyle={styles.content} footer={footer}>
        <BrandLogo height={26} testID="welcome-brand" />

        <View style={styles.hero}>
          <View style={styles.sun} />
          <View style={styles.ground} />
          <View style={styles.tag}>
            <Icon name="paw" size={14} color={theme.color.text} />
            <Text style={styles.tagText}>{`Booked with ${sitter.name}`}</Text>
          </View>
          {STICKERS.map((s, k) => (
            <Bob key={k} delay={s.delay} style={[styles.sticker, s.at, s.tilt ? { transform: [{ rotate: s.tilt }] } : null]}>
              <Image source={s.src} style={{ width: s.size, height: s.size }} resizeMode="contain" aria-hidden />
            </Bob>
          ))}
          <Image source={MAX} style={styles.max} resizeMode="contain" accessibilityLabel={`${pets[0]}, a white dog`} />
          <Image source={MOCHI} style={styles.mochi} resizeMode="contain" accessibilityLabel={`${pets[1]}, an orange cat`} />
        </View>

        <Text accessibilityRole="header" style={styles.title}>
          Leave your pet. Keep your peace of mind.
        </Text>
        <Text style={styles.lead}>Updates from your sitter without asking. Care notes for sitters without typing.</Text>
        <View style={styles.row}>
          <TextButton label="How it works ›" onPress={() => router.push("/welcome/how")} testID="welcome-how" />
        </View>
      </Screen>
      <DemoSheet visible={demoOpen} onClose={() => setDemoOpen(false)} />
    </View>
  );
}

/** A sticker that floats up and down a little (still when Reduce motion is on). */
function Bob({ delay, style, children }: { delay: number; style: object; children: ReactNode }) {
  const reduce = useReduceMotion();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: -4, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(y, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, delay, y]);
  return (
    <Animated.View style={[style, { marginTop: y }]} aria-hidden>
      {children}
    </Animated.View>
  );
}

const makeStyles = (theme: Theme) => {
  const display = theme.fontFamily.display;
  return StyleSheet.create({
    root: { flex: 1 },
    content: { gap: theme.spacing.md },
    hero: {
      height: 170,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.color.blockMint,
      overflow: "hidden",
    },
    sun: {
      position: "absolute",
      width: 180,
      height: 180,
      borderRadius: 90,
      right: -40,
      top: -50,
      backgroundColor: theme.color.blockButter,
    },
    ground: {
      position: "absolute",
      left: "-10%",
      right: "-10%",
      bottom: -60,
      height: 110,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.primary,
      opacity: 0.16,
    },
    tag: {
      position: "absolute",
      right: 14,
      top: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.gold,
    },
    tagText: { fontSize: theme.fontSize.caption + 1, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    sticker: { position: "absolute" },
    max: { position: "absolute", left: 14, bottom: 14, width: 80, height: 110 },
    mochi: { position: "absolute", right: 10, bottom: 18, width: 128, height: 66 },
    title: {
      fontSize: theme.fontSize.title + 4,
      lineHeight: theme.fontSize.title + 10,
      color: theme.color.text,
      ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.bold }),
    },
    lead: { fontSize: theme.fontSize.body, color: theme.color.textMuted, lineHeight: 22 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    footer: { gap: theme.spacing.sm },
    links: { flexDirection: "row", justifyContent: "space-between" },
  });
};
