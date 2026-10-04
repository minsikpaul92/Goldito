import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Screen } from "../../../components/ui/Screen";
import { TextButton } from "../../../components/ui/TextButton";
import { useTheme, useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

/**
 * Onboarding landing (OB.1–OB.2): pick a role for a short tour, then Sign in
 * opens the existing login screen (unchanged).
 */
export default function WelcomeLanding() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.root} testID="welcome">
      <Screen contentStyle={styles.content}>
        <Text style={styles.brand} testID="welcome-brand">
          🐾 PawNote
        </Text>
        <Text accessibilityRole="header" style={styles.title}>
          Care updates without the back-and-forth
        </Text>
        <Text style={styles.lead}>
          Choose how you use PawNote — we'll show you what matters for that role. Sign in stays on the
          next screen, same as before.
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/welcome/owner")}
          style={({ pressed }) => [styles.roleCard, pressed && styles.pressed]}
          testID="welcome-choose-owner"
        >
          <Ionicons name="home-outline" size={theme.icon.md} color={theme.color.primary} />
          <View style={styles.roleText}>
            <Text style={styles.roleTitle}>Pet owner</Text>
            <Text style={styles.roleBody}>
              See care updates as if your sitter already knows what you care about — no more chasing them
              for how the stay is going.
            </Text>
            <Text style={styles.ctaHint}>See owner tour →</Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/welcome/sitter")}
          style={({ pressed }) => [styles.roleCard, pressed && styles.pressed]}
          testID="welcome-choose-sitter"
        >
          <Ionicons name="heart-outline" size={theme.icon.md} color={theme.color.primary} />
          <View style={styles.roleText}>
            <Text style={styles.roleTitle}>Pet sitter</Text>
            <Text style={styles.roleBody}>
              Focus on the pets. Care needs, allergies, reports, and bookings — the app helps you handle
              them in moments, not essays.
            </Text>
            <Text style={styles.ctaHint}>See sitter tour →</Text>
          </View>
        </Pressable>
      </Screen>

      <View style={styles.footer}>
        <TextButton label="Sign in" onPress={() => router.push("/login")} testID="welcome-sign-in" />
        <TextButton
          label="Create account"
          onPress={() => router.push("/signup")}
          testID="welcome-sign-up"
        />
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: { gap: theme.spacing.md, paddingBottom: theme.spacing.md },
    brand: {
      fontSize: theme.fontSize.body,
      fontWeight: "700",
      color: theme.color.primary,
    },
    title: {
      fontSize: theme.fontSize.title,
      fontWeight: "700",
      color: theme.color.text,
    },
    lead: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      lineHeight: 20,
    },
    roleCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      minHeight: 44,
    },
    pressed: { opacity: 0.9 },
    roleText: { flex: 1, gap: theme.spacing.xs },
    roleTitle: {
      fontSize: theme.fontSize.body,
      fontWeight: "700",
      color: theme.color.text,
    },
    roleBody: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      lineHeight: 20,
    },
    ctaHint: {
      marginTop: theme.spacing.xs,
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.primary,
    },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      gap: theme.spacing.lg,
      padding: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
  });
