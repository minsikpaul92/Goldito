import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { TextButton } from "../../components/ui/TextButton";
import { TextField } from "../../components/ui/TextField";
import { describeAuthError } from "../../lib/authErrors";
import { SUPABASE_NOT_CONFIGURED, getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

export default function LoginScreen() {
  const styles = useThemedStyles(makeStyles);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = isSupabaseConfigured && email.trim() !== "" && password !== "" && !submitting;

  async function signIn() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { error: authError } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    // On success the session changes and the (auth) layout sends the user on.
    if (authError) setError(describeAuthError(authError));
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.brand}>🐾 PawNote</Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to see today's care updates.</Text>
      </View>

      {!isSupabaseConfigured ? (
        <Card>
          <Text style={styles.error}>{SUPABASE_NOT_CONFIGURED}</Text>
        </Card>
      ) : null}

      <View style={styles.form}>
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
          testID="login-email"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={() => void signIn()}
          testID="login-password"
        />
        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="login-error">
            {error}
          </Text>
        ) : null}
        <Button label={submitting ? "Signing in…" : "Sign in"} onPress={() => void signIn()} disabled={!canSubmit} />
      </View>

      <TextButton label="New here? Create an account" onPress={() => router.push("/signup")} testID="go-signup" />
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      justifyContent: "center",
      gap: theme.spacing.lg,
    },
    header: {
      gap: theme.spacing.xs,
    },
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
    subtitle: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    form: {
      gap: theme.spacing.md,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
  });
