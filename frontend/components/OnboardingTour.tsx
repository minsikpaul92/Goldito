import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MediaPlaceholder } from "./MediaPlaceholder";
import { BackLink } from "./ui/BackLink";
import { Button } from "./ui/Button";
import { TextButton } from "./ui/TextButton";
import { isDemoEnabled } from "../lib/demo";
import { Role } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type TourStep = {
  title: string;
  body: string;
  media?: {
    kind: "image" | "video";
    title: string;
    brief: string;
  };
};

type Props = {
  role: Role;
  steps: TourStep[];
  testID: string;
};

/** Role onboarding: one phone-height page per step (no scroll). */
export function OnboardingTour({ role, steps, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  const demoLabel = role === "owner" ? "Try demo as Owner" : "Try demo as Sitter";

  return (
    <SafeAreaView style={styles.root} testID={testID}>
      <View style={styles.topBar}>
        <BackLink
          onPress={() => {
            if (index === 0) router.replace("/welcome");
            else setIndex((i) => i - 1);
          }}
          testID={`${testID}-back`}
        />
        <Text style={styles.progress} testID={`${testID}-progress`}>
          {`${index + 1} / ${steps.length}`}
        </Text>
      </View>

      <View style={styles.main}>
        <View style={styles.copy}>
          <Text style={styles.roleTag}>{role === "owner" ? "For pet owners" : "For pet sitters"}</Text>
          <Text accessibilityRole="header" style={styles.title} testID={`${testID}-title`}>
            {step.title}
          </Text>
          <Text style={styles.body}>{step.body}</Text>
        </View>

        {step.media ? (
          <View style={styles.mediaSlot}>
            <MediaPlaceholder
              kind={step.media.kind}
              title={step.media.title}
              brief={step.media.brief}
              testID={`${testID}-media-${index}`}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        {!last ? (
          <Button label="Next" onPress={() => setIndex((i) => i + 1)} testID={`${testID}-next`} />
        ) : (
          <>
            {isDemoEnabled ? (
              <Button
                label={demoLabel}
                onPress={() => router.push(`/login?demo=${role}`)}
                testID={`${testID}-demo`}
              />
            ) : null}
            <Button
              label="Sign in"
              variant={isDemoEnabled ? "secondary" : "primary"}
              onPress={() => router.push("/login")}
              testID={`${testID}-sign-in`}
            />
            <TextButton
              label="Create account"
              onPress={() => router.push("/signup")}
              testID={`${testID}-sign-up`}
            />
          </>
        )}
        <View style={styles.dots}>
          {steps.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.color.background },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.md,
    },
    progress: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      fontWeight: "600",
    },
    main: {
      flex: 1,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
      gap: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
    copy: { gap: theme.spacing.xs },
    roleTag: {
      fontSize: theme.fontSize.caption,
      fontWeight: "700",
      color: theme.color.textMuted,
      textTransform: "uppercase",
    },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: "700",
      color: theme.color.text,
      lineHeight: 24,
    },
    body: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      lineHeight: 20,
    },
    mediaSlot: {
      flex: 1,
      justifyContent: "center",
      minHeight: 0,
    },
    footer: {
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: theme.spacing.xs,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.color.border,
    },
    dotOn: { backgroundColor: theme.color.primary },
  });
