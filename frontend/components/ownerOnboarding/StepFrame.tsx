import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "../../components/ui/Icon";
import { BrandLogo } from "../BrandLogo";
import { Button } from "../ui/Button";
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
  /** Skip this question: the right button of the Back and Skip row under the footer. */
  onSkip?: () => void;
  skipTestID?: string;
  children: ReactNode;
  /** Below the answers: the primary button (and anything else that goes above the Back and Skip row). */
  footer?: ReactNode;
  /** Sits in the right half of the Back row, in place of Skip. */
  rowNext?: ReactNode;
  testID?: string;
};

/** One question per screen, large text (11.15 §7.1): logo, progress bar, Back, a 28 px question, the answers, the footer. */
export function StepFrame({ progress, title, hint, onBack, onSkipAll, onSkip, skipTestID = "own-skip", children, footer, rowNext, testID }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  // Pinned to the bottom of the screen, so Back and Skip sit in the same place on every question.
  const pinned =
    footer || onBack || onSkip || rowNext ? (
      <View style={styles.footer}>
        {footer}
        {onBack || onSkip || rowNext ? (
          <View style={styles.navRow}>
            <View style={styles.navSlot}>
              {onBack ? <Button label="Back" variant="secondary" onPress={onBack} testID="own-back-bottom" /> : null}
            </View>
            <View style={styles.navSlot}>
              {rowNext ?? (onSkip ? <Button label="Skip" variant="secondary" onPress={onSkip} testID={skipTestID} /> : null)}
            </View>
          </View>
        ) : null}
      </View>
    ) : undefined;

  return (
    <Screen contentStyle={styles.content} footer={pinned} testID={testID}>
      <View style={styles.header}>
        <BrandLogo height={28} testID="step-brand" />
        {onSkipAll ? <TextButton label="Skip all" onPress={onSkipAll} testID="own-skip-all" /> : null}
      </View>
      <View style={styles.top}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back} testID="own-back">
            <Icon name="back" size={theme.icon.md} color={theme.color.text} />
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
    footer: { gap: theme.spacing.sm, alignItems: "stretch" },
    navRow: { flexDirection: "row", gap: theme.spacing.sm },
    navSlot: { flex: 1 },
  });
