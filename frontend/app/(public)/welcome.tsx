import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { TextButton } from "../../components/ui/TextButton";
import { isDemoEnabled } from "../../lib/demo";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

const STAGES = [
  "Ask and get an answer in seconds",
  "Turn care notes into a checklist",
  "Book, sign, and unlock on time",
  "Track the ride, get the daily note",
  "Home safe, remembered next time",
] as const;

/**
 * Welcome / Intro (OB.1–OB.2). Logged-out `/` lands here.
 * Try demo reuses login `?demo=` (OB.3).
 */
export default function WelcomeScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.root} testID="welcome">
      <Screen contentStyle={styles.content}>
        <Text style={styles.brand} testID="welcome-brand">
          🐾 PawNote
        </Text>

        <View style={styles.step} testID="welcome-step-1">
          <Text accessibilityRole="header" style={styles.title}>
            Peace of mind for owners. Less typing for sitters.
          </Text>
          <Text style={styles.body}>
            Owners wonder how the stay is going. Sitters drown in DMs and report essays. PawNote closes
            that gap for dogs and cats.
          </Text>
        </View>

        <View style={styles.step} testID="welcome-step-2">
          <Text style={styles.sectionLabel}>Two roles</Text>
          <Card style={styles.roleCard}>
            <Ionicons name="home-outline" size={theme.icon.md} color={theme.color.primary} />
            <View style={styles.roleText}>
              <Text style={styles.roleTitle}>Pet owner</Text>
              <Text style={styles.body}>Learn without asking — updates and photos arrive while you're away.</Text>
            </View>
          </Card>
          <Card style={styles.roleCard}>
            <Ionicons name="heart-outline" size={theme.icon.md} color={theme.color.primary} />
            <View style={styles.roleText}>
              <Text style={styles.roleTitle}>Pet sitter</Text>
              <Text style={styles.body}>Care, snap, and tap — no report essays, no repeat messages.</Text>
            </View>
          </Card>
        </View>

        <View style={styles.step} testID="welcome-step-3">
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            A stay with PawNote
          </Text>
          {STAGES.map((line, i) => (
            <Text key={line} style={styles.bullet}>{`${i + 1}. ${line}`}</Text>
          ))}
        </View>
      </Screen>

      <View style={styles.footer}>
        {isDemoEnabled ? (
          <>
            <Button
              label="Try demo as Sitter"
              onPress={() => router.push("/login?demo=sitter")}
              testID="welcome-demo-sitter"
            />
            <Button
              label="Try demo as Owner"
              variant="secondary"
              onPress={() => router.push("/login?demo=owner")}
              testID="welcome-demo-owner"
            />
          </>
        ) : null}
        <View style={styles.links}>
          <TextButton label="Sign in" onPress={() => router.push("/login")} testID="welcome-sign-in" />
          <TextButton
            label="Create account"
            onPress={() => router.push("/signup")}
            testID="welcome-sign-up"
          />
        </View>
        <TextButton
          label="Skip to sign in"
          onPress={() => router.push("/login")}
          testID="welcome-skip"
        />
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: {
      gap: theme.spacing.lg,
      paddingBottom: theme.spacing.md,
    },
    brand: {
      fontSize: theme.fontSize.body,
      fontWeight: "700",
      color: theme.color.primary,
    },
    step: { gap: theme.spacing.sm },
    title: {
      fontSize: theme.fontSize.title,
      fontWeight: "700",
      color: theme.color.text,
    },
    sectionLabel: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.textMuted,
      textTransform: "uppercase",
    },
    sectionTitle: {
      fontSize: theme.fontSize.body,
      fontWeight: "700",
      color: theme.color.text,
    },
    body: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      lineHeight: 20,
    },
    roleCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.md,
    },
    roleText: { flex: 1, gap: 2 },
    roleTitle: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    bullet: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
      lineHeight: 22,
    },
    footer: {
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    links: {
      flexDirection: "row",
      justifyContent: "center",
      gap: theme.spacing.lg,
    },
  });
