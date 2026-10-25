import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BrandLogo } from "../../components/BrandLogo";
import { RoleCard } from "../../components/RoleCard";
import { BackLink } from "../../components/ui/BackLink";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { TextButton } from "../../components/ui/TextButton";
import { TextField } from "../../components/ui/TextField";
import { describeAuthError } from "../../lib/authErrors";
import {
  SUPABASE_NOT_CONFIGURED,
  getSupabase,
  isSupabaseConfigured,
} from "../../lib/supabase";
import { Role } from "../../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { AppleLogo, GoogleLogo } from "../../components/ui/SocialIcons";

const MIN_PASSWORD_LENGTH = 6;
// Shape only (name@domain.tld) — whether the inbox exists is Supabase "Confirm email".
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 0 to 4 bars: length, then mixed case, a digit, a symbol. */
function passwordStrength(pw: string): number {
  if (pw === "") return 0;
  let score = pw.length >= MIN_PASSWORD_LENGTH ? 1 : 0;
  if (pw.length >= 10) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.max(score, 1);
}

const STRENGTH_LABELS = ["", "Weak", "Okay", "Good", "Strong"];

/** Back to where the visitor came from, or Welcome on a direct link (OB.1). */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/welcome");
}

export default function SignupScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [role, setRole] = useState<Role | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Shown as soon as the second password is typed, not only on submit.
  const strength = passwordStrength(password);
  const mismatch =
    confirm !== "" && confirm !== password ? "Passwords don't match." : null;

  const canSubmit =
    isSupabaseConfigured &&
    role !== null &&
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    email.trim() !== "" &&
    password !== "" &&
    confirm === password &&
    !submitting;

  async function createAccount() {
    if (!canSubmit || !role) return;
    if (!EMAIL_SHAPE.test(email.trim())) {
      setError("Enter a valid email address, like you@example.com.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    // The signup trigger creates profiles + owner/sitter profile from this metadata (D15, D21).
    const { data, error: authError } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      // One display name for everything that shows or reads a name (the AI takes the first word as the first name).
      options: {
        data: { role, display_name: `${firstName.trim()} ${lastName.trim()}` },
      },
    });
    setSubmitting(false);
    if (authError) {
      setError(describeAuthError(authError));
      return;
    }
    if (!data.session) {
      // Only when "Confirm email" is on in Supabase (D15 recommends off).
      setNotice("Check your email to confirm your account, then sign in.");
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <BackLink onPress={goBack} testID="signup-back" />

      <View style={styles.header}>
        <BrandLogo height={32} testID="signup-brand" />
        <Text style={styles.title}>Create your account</Text>
      </View>

      {!isSupabaseConfigured ? (
        <Card>
          <Text style={styles.error}>{SUPABASE_NOT_CONFIGURED}</Text>
        </Card>
      ) : null}

      <View accessibilityRole="radiogroup" style={styles.roles}>
        <RoleCard
          icon="home"
          title="I'm a pet owner"
          selected={role === "owner"}
          onPress={() => setRole("owner")}
          testID="role-owner"
        />
        <RoleCard
          icon="heart"
          title="I'm a pet sitter"
          selected={role === "sitter"}
          onPress={() => setRole("sitter")}
          testID="role-sitter"
        />
      </View>

      <View style={styles.form}>
        <View style={styles.nameRow}>
          <View style={styles.nameField}>
            <TextField
              label="First name"
              value={firstName}
              onChangeText={setFirstName}
              autoComplete="given-name"
              textContentType="givenName"
              testID="signup-first-name"
            />
          </View>
          <View style={styles.nameField}>
            <TextField
              label="Last name"
              value={lastName}
              onChangeText={setLastName}
              autoComplete="family-name"
              textContentType="familyName"
              testID="signup-last-name"
            />
          </View>
        </View>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          inputMode="email"
          textContentType="emailAddress"
          testID="signup-email"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          testID="signup-password"
        />
        {strength > 0 ? (
          <View style={styles.strength} testID="signup-strength">
            <View style={styles.meter}>
              {[1, 2, 3, 4].map((n) => (
                <View
                  key={n}
                  style={[styles.bar, n <= strength && styles.barOn]}
                />
              ))}
            </View>
            <Text style={styles.strengthLabel}>
              {STRENGTH_LABELS[strength]}
            </Text>
          </View>
        ) : null}
        <TextField
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          error={mismatch}
          onSubmitEditing={() => void createAccount()}
          testID="signup-confirm"
        />
        {error ? (
          <Text
            accessibilityRole="alert"
            style={styles.error}
            testID="signup-error"
          >
            {error}
          </Text>
        ) : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Button
          label={submitting ? "Creating account…" : "Create account"}
          onPress={() => void createAccount()}
          disabled={!canSubmit}
          testID="create-account"
        />
      </View>

      <Text style={styles.terms}>
        By continuing you agree to the Terms and Privacy Policy.
      </Text>

      <TextButton
        label="Already have an account? Sign in"
        onPress={() => router.replace("/login")}
        style={styles.login}
        testID="go-login"
      />
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.md,
    },
    header: {
      gap: theme.spacing.xs,
    },
    title: {
      fontSize: theme.fontSize.title,
      fontWeight: theme.fontWeight.bold,
      color: theme.color.text,
    },
    subtitle: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    roles: {
      gap: theme.spacing.sm,
    },
    social: {
      gap: theme.spacing.sm,
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    rule: {
      flex: 1,
      height: 1,
      backgroundColor: theme.color.border,
    },
    dividerLabel: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    form: {
      gap: theme.spacing.md,
    },
    nameRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    nameField: {
      flex: 1,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
    strength: {
      gap: theme.spacing.xs,
      marginTop: -theme.spacing.xs,
    },
    meter: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    strengthLabel: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    bar: {
      flex: 1,
      height: 4,
      borderRadius: 999,
      backgroundColor: theme.color.track,
    },
    barOn: {
      backgroundColor: theme.color.success,
    },
    terms: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      textAlign: "center",
    },
    login: {
      marginTop: -theme.spacing.sm,
    },
    notice: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
  });
