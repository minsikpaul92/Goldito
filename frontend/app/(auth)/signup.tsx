import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Art } from "../../components/art/Art";
import { SocialSignIn } from "../../components/intro/SocialSignIn";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { StepHeader } from "../../components/ui/StepHeader";
import { TextButton } from "../../components/ui/TextButton";
import { TextField } from "../../components/ui/TextField";
import { describeAuthError } from "../../lib/authErrors";
import {
  SUPABASE_NOT_CONFIGURED,
  getSupabase,
  isSupabaseConfigured,
} from "../../lib/supabase";
import { Role } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

const MIN_PASSWORD_LENGTH = 6;
// Shape only (name@domain.tld) — whether the inbox exists is Supabase "Confirm email".
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STEPS = 3;

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

/**
 * Sign up in three short steps (intro trial): who you are, your name and email, a password. One progress bar and
 * one Back; Back on the first step leaves.
 */
export default function SignupScreen() {
  const styles = useThemedStyles(makeStyles);
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = passwordStrength(password);
  const nameDone = firstName.trim() !== "" && lastName.trim() !== "" && email.trim() !== "";
  const canSubmit = isSupabaseConfigured && role !== null && nameDone && password !== "" && !submitting;

  function back() {
    setError(null);
    if (step === 0) goBack();
    else setStep(step - 1);
  }

  function toPassword() {
    if (!nameDone) return;
    if (!EMAIL_SHAPE.test(email.trim())) {
      setError("Enter a valid email address, like you@example.com.");
      return;
    }
    setError(null);
    setStep(2);
  }

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

  const errorText = error ? (
    <Text accessibilityRole="alert" style={styles.error} testID="signup-error">
      {error}
    </Text>
  ) : null;

  let body;
  let action;
  if (step === 0) {
    body = (
      <>
        <Text style={styles.title}>Who are you?</Text>
        <Text style={styles.subtitle}>You can add the other side later.</Text>
        <View accessibilityRole="radiogroup" style={styles.roles}>
          <RoleOption
            art="owner/pet-dog"
            title="I have a pet"
            body="Book a sitter and get updates without asking."
            selected={role === "owner"}
            onPress={() => setRole("owner")}
            owner
            testID="role-owner"
          />
          <RoleOption
            art="sitter/five-second"
            title="I'm a pet sitter"
            body="Care, snap, tap. Goldito writes the day."
            selected={role === "sitter"}
            onPress={() => setRole("sitter")}
            testID="role-sitter"
          />
        </View>
      </>
    );
    action = (
      <Button
        label={role ? "Continue" : "Pick one to continue"}
        onPress={() => setStep(1)}
        disabled={!role}
        testID="signup-continue"
      />
    );
  } else if (step === 1) {
    body = (
      <>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          {role === "owner" ? "Your sitter sees your first name." : "Owners see your first name."}
        </Text>
        <SocialSignIn divider="or with email" testID="signup" />
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
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            textContentType="emailAddress"
            onSubmitEditing={toPassword}
            testID="signup-email"
          />
          {errorText}
        </View>
      </>
    );
    action = <Button label="Continue" onPress={toPassword} disabled={!nameDone} testID="signup-continue" />;
  } else {
    body = (
      <>
        <Text style={styles.title}>Make a password</Text>
        <Text style={styles.subtitle}>Six characters or more.</Text>
        <View style={styles.form}>
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={() => void createAccount()}
            testID="signup-password"
          />
          {strength > 0 ? (
            <View style={styles.strength} testID="signup-strength">
              <View style={styles.meter}>
                {[1, 2, 3, 4].map((n) => (
                  <View key={n} style={[styles.bar, n <= strength && styles.barOn]} />
                ))}
              </View>
              <Text style={styles.strengthLabel}>{STRENGTH_LABELS[strength]}</Text>
            </View>
          ) : null}
          {errorText}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        </View>
        <Text style={styles.terms}>
          By creating an account you agree to the{" "}
          <Text
            accessibilityRole="link"
            style={styles.termsLink}
            onPress={() => router.push("/terms")}
            testID="signup-terms-link"
          >
            Terms
          </Text>{" "}
          and{" "}
          <Text
            accessibilityRole="link"
            style={styles.termsLink}
            onPress={() => router.push("/privacy")}
            testID="signup-privacy-link"
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </>
    );
    action = (
      <Button
        label={submitting ? "Creating account…" : "Create account"}
        onPress={() => void createAccount()}
        disabled={!canSubmit}
        testID="create-account"
      />
    );
  }

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {action}
          {step === 0 ? (
            <TextButton
              label="Already have an account? Log in"
              onPress={() => router.replace("/login")}
              testID="go-login"
            />
          ) : null}
        </View>
      }
    >
      <StepHeader flow="Sign up" step={step + 1} total={STEPS} onBack={back} testID="signup" />
      {!isSupabaseConfigured ? (
        <Card>
          <Text style={styles.error}>{SUPABASE_NOT_CONFIGURED}</Text>
        </Card>
      ) : null}
      {body}
    </Screen>
  );
}

type RoleOptionProps = {
  art: "owner/pet-dog" | "sitter/five-second";
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
  owner?: boolean;
  testID: string;
};

/** A role as a big colored card with a radio dot (peach for owners, mint for sitters, like the demo tiles). */
function RoleOption({ art, title, body, selected, onPress, owner, testID }: RoleOptionProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={selected}
      onPress={onPress}
      style={[styles.role, owner ? styles.roleOwner : styles.roleSitter, selected && styles.roleSelected]}
      testID={testID}
    >
      <Art name={art} size={56} />
      <View style={styles.roleText}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleBody}>{body}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) => {
  const display = theme.fontFamily.display;
  return StyleSheet.create({
    content: {
      gap: theme.spacing.md,
    },
    title: {
      fontSize: theme.fontSize.title,
      color: theme.color.text,
      ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.bold }),
    },
    subtitle: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      marginTop: -theme.spacing.sm,
    },
    roles: {
      gap: theme.spacing.sm,
    },
    role: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      padding: theme.spacing.md,
      borderRadius: theme.radius.xl,
      borderWidth: 2,
      borderColor: "transparent",
      minHeight: 44,
    },
    roleOwner: { backgroundColor: theme.color.blockPeach },
    roleSitter: { backgroundColor: theme.color.blockMint },
    roleSelected: { borderColor: theme.color.primary },
    roleText: { flex: 1, gap: 2 },
    roleTitle: {
      fontSize: theme.fontSize.lead,
      color: theme.color.text,
      ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.bold }),
    },
    roleBody: { fontSize: theme.fontSize.small, color: theme.color.text, lineHeight: 20 },
    radio: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    radioOn: { borderColor: theme.color.primary },
    radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.color.primary },
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
    termsLink: {
      color: theme.color.primary,
      textDecorationLine: "underline",
    },
    notice: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    footer: { gap: theme.spacing.xs },
  });
};
