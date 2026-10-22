import Ionicons from "@expo/vector-icons/Ionicons";
import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BrandLogo } from "../BrandLogo";
import { Screen } from "../ui/Screen";
import { TextButton } from "../ui/TextButton";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = {
  /** 0 to 1. */
  progress: number;
  title: string;
  hint?: string;
  onBack?: () => void;
  onSkipAll?: () => void;
  children: ReactNode;
  /** Below the answers: the primary button and the Skip link. */
  footer?: ReactNode;
  testID?: string;
};

/** One question per screen, large text (11.15 §7.1): logo, progress bar, Back, a 28 px question, the answers, the footer. */
export function StepFrame({ progress, title, hint, onBack, onSkipAll, children, footer, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Screen contentStyle={styles.content} testID={testID}>
      <View style={styles.header}>
        <BrandLogo height={28} testID="step-brand" />
        {onSkipAll ? <TextButton label="Skip all" onPress={onSkipAll} testID="own-skip-all" /> : null}
      </View>
      <View style={styles.top}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back} testID="own-back">
            <Ionicons name="chevron-back" size={theme.icon.md} color={theme.color.text} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
          <View style={[styles.bar, { width: `${Math.max(4, Math.round(progress * 100))}%` }]} />
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header" testID="own-title">
        {title}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.body}>{children}</View>
      {footer || onBack ? (
        <View style={styles.footer}>
          {footer}
          {onBack ? <TextButton label="Back" onPress={onBack} testID="own-back-bottom" /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: theme.layout.touchTarget },
    top: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    back: { width: theme.layout.touchTarget, height: theme.layout.touchTarget, justifyContent: "center" },
    track: { flex: 1, height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.color.track, overflow: "hidden" },
    bar: { height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.color.primary },
    title: {
      fontSize: 28,
      lineHeight: 36,
      fontWeight: theme.fontWeight.bold,
      color: theme.color.text,
      fontFamily: theme.fontFamily.display,
      marginTop: theme.spacing.sm,
    },
    hint: { fontSize: 18, lineHeight: 24, color: theme.color.textMuted },
    body: { gap: theme.spacing.sm + theme.spacing.xs },
    footer: { gap: theme.spacing.sm, marginTop: theme.spacing.sm, alignItems: "stretch" },
  });
