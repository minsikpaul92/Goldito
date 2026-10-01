import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { RoleCard } from "../../components/RoleCard";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { TextButton } from "../../components/ui/TextButton";
import { TextField } from "../../components/ui/TextField";
import { describeAuthError } from "../../lib/authErrors";
import { SUPABASE_NOT_CONFIGURED, getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import { Role } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

const MIN_PASSWORD_LENGTH = 6;

export default function SignupScreen() {
  const styles = useThemedStyles(makeStyles);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    isSupabaseConfigured &&
    role !== null &&
    name.trim() !== "" &&
    email.trim() !== "" &&
    password !== "" &&
    !submitting;

  async function createAccount() {
    if (!canSubmit || !role) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    // The signup trigger creates profiles + owner/sitter profile from this metadata (D15, D21).
    const { data, error: authError } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { role, display_name: name.trim() } },
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
      <View style={styles.header}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>First, how will you use PawNote?</Text>
      </View>

      {!isSupabaseConfigured ? (
        <Card>
          <Text style={styles.error}>{SUPABASE_NOT_CONFIGURED}</Text>
        </Card>
      ) : null}

      <View accessibilityRole="radiogroup" style={styles.roles}>
        <RoleCard
          icon="home-outline"
          title="I'm a pet owner"
          description="Learn without asking — updates and photos arrive while you're away."
          selected={role === "owner"}
          onPress={() => setRole("owner")}
          testID="role-owner"
        />
        <RoleCard
          icon="heart-outline"
          title="I'm a pet sitter"
          description="Care, snap, tap — no reports to type, no repeat messages."
          selected={role === "sitter"}
          onPress={() => setRole("sitter")}
          testID="role-sitter"
        />
      </View>

      <View style={styles.form}>
        <TextField
          label="Your name"
          value={name}
          onChangeText={setName}
          placeholder="Shown to owners and sitters"
          autoComplete="name"
          textContentType="name"
          testID="signup-name"
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
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
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={() => void createAccount()}
          testID="signup-password"
        />
        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="signup-error">
            {error}
          </Text>
        ) : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Button
          label={submitting ? "Creating account…" : "Create account"}
          onPress={() => void createAccount()}
          disabled={!canSubmit}
        />
      </View>

      <TextButton label="Already have an account? Sign in" onPress={() => router.replace("/login")} />
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.lg,
    },
    header: {
      gap: theme.spacing.xs,
      marginTop: theme.spacing.lg,
    },
    title: {
      fontSize: theme.fontSize.title,
      fontWeight: "700",
      color: theme.color.text,
    },
    subtitle: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    roles: {
      gap: theme.spacing.sm,
    },
    form: {
      gap: theme.spacing.md,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
    notice: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
  });
