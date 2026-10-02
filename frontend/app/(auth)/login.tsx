import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { TextButton } from "../../components/ui/TextButton";
import { TextField } from "../../components/ui/TextField";
import { describeAuthError } from "../../lib/authErrors";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, isDemoEnabled, isDemoRole } from "../../lib/demo";
import { Role } from "../../providers/SessionProvider";
import { SUPABASE_NOT_CONFIGURED, getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

export default function LoginScreen() {
  const styles = useThemedStyles(makeStyles);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const params = useLocalSearchParams<{ demo?: string }>();
  const demoTried = useRef(false);

  const canSubmit = isSupabaseConfigured && email.trim() !== "" && password !== "" && !submitting;

  async function signInWith(emailValue: string, passwordValue: string) {
    setSubmitting(true);
    setError(null);
    const { error: authError } = await getSupabase().auth.signInWithPassword({
      email: emailValue.trim(),
      password: passwordValue,
    });
    setSubmitting(false);
    // On success the session changes and the (auth) layout sends the user on.
    if (authError) setError(describeAuthError(authError));
  }

  function signIn() {
    if (canSubmit) void signInWith(email, password);
  }

  // Try demo (OB.3): fill the seeded account so the judge sees what happens, then sign in.
  function tryDemo(role: Role) {
    if (!isDemoEnabled || !isSupabaseConfigured || submitting) return;
    const { email: demoEmail } = DEMO_ACCOUNTS[role];
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    void signInWith(demoEmail, DEMO_PASSWORD);
  }

  // /login?demo=owner|sitter does the same (desktop side panel 10.9, split view 10.10).
  useEffect(() => {
    if (demoTried.current || !isDemoRole(params.demo)) return;
    demoTried.current = true;
    tryDemo(params.demo);
    // Once per visit; tryDemo only reads constants and state setters.
  }, [params.demo]);

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
          onSubmitEditing={signIn}
          testID="login-password"
        />
        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="login-error">
            {error}
          </Text>
        ) : null}
        <Button label={submitting ? "Signing in…" : "Sign in"} onPress={signIn} disabled={!canSubmit} />
      </View>

      <TextButton label="New here? Create an account" onPress={() => router.push("/signup")} testID="go-signup" />

      {isDemoEnabled ? (
        <Card style={styles.demo} testID="demo-block">
          <Text style={styles.demoTitle}>Try the demo</Text>
          <Text style={styles.subtitle}>
            For judges: sign in to a ready-made account — Bori (chicken allergy) is already set up.
          </Text>
          <View style={styles.demoButtons}>
            <Button
              label="Demo owner"
              variant="secondary"
              onPress={() => tryDemo("owner")}
              disabled={submitting || !isSupabaseConfigured}
              style={styles.demoButton}
              testID="demo-owner"
            />
            <Button
              label="Demo sitter"
              variant="secondary"
              onPress={() => tryDemo("sitter")}
              disabled={submitting || !isSupabaseConfigured}
              style={styles.demoButton}
              testID="demo-sitter"
            />
          </View>
        </Card>
      ) : null}
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
    demo: {
      gap: theme.spacing.sm,
    },
    demoTitle: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    demoButtons: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    demoButton: {
      flex: 1,
    },
  });
