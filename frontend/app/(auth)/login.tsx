import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BrandLogo } from "../../components/BrandLogo";
import { OrDivider } from "../../components/intro/OrDivider";
import { RoleArt } from "../../components/intro/RoleArt";
import { SocialSignIn } from "../../components/intro/SocialSignIn";
import { BackLink } from "../../components/ui/BackLink";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { TextButton } from "../../components/ui/TextButton";
import { Select } from "../../components/ui/Select";
import { TextField } from "../../components/ui/TextField";
import { describeAuthError } from "../../lib/authErrors";
import { ChoiceChips } from "../../components/ui/ChoiceChips";
import {
  DEMO_PASSWORD,
  JUDGE_SETS,
  TEAM_SETS,
  demoSetFor,
  isDemoEnabled,
  isDemoRole,
  isDemoToolsBuild,
} from "../../lib/demo";
import { isJudgeSetKey, takeSeat } from "../../lib/judgeSeat";
import { useJudgeSeats } from "../../lib/useJudgeSeats";
import { postJudgeSeat } from "../../components/shell/judgeMessages";
import { Role, useSession } from "../../providers/SessionProvider";
import {
  SUPABASE_NOT_CONFIGURED,
  getSupabase,
  isSupabaseConfigured,
} from "../../lib/supabase";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

export default function LoginScreen() {
  const styles = useThemedStyles(makeStyles);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const params = useLocalSearchParams<{ demo?: string; set?: string }>();
  const { seatNotice } = useSession();
  // Whose demo accounts the two buttons sign in to. The team's build picks a team set or "Judge seats"; the judging
  // build offers only the Judge seats (#411).
  const [team, setTeam] = useState(() => {
    if (!isDemoToolsBuild) return JUDGES;
    return isJudgeSetKey(params.set ?? "") ? JUDGES : demoSetFor(params.set).key;
  });
  const judging = team === JUDGES;
  const seats = useJudgeSeats(isDemoEnabled && isSupabaseConfigured && judging);
  const [seatPick, setSeatPick] = useState<string | null>(() => (isJudgeSetKey(params.set ?? "") ? params.set! : null));
  // The picked seat, or the first free one.
  const seatKey = seatPick ?? seats?.find((s) => s.mine)?.set ?? seats?.find((s) => !s.inUse)?.set ?? null;
  const allBusy = seats !== null && seats.every((s) => s.inUse && !s.mine);
  const setKey = judging ? (seatKey ?? JUDGE_SETS[0].key) : team;
  const demoTried = useRef(false);
  const demoSet = demoSetFor(setKey);

  const canSubmit =
    isSupabaseConfigured &&
    email.trim() !== "" &&
    password !== "" &&
    !submitting;

  async function signInWith(emailValue: string, passwordValue: string): Promise<boolean> {
    setSubmitting(true);
    setError(null);
    const { error: authError } = await getSupabase().auth.signInWithPassword({
      email: emailValue.trim(),
      password: passwordValue,
    });
    setSubmitting(false);
    // On success the session changes and the (auth) layout sends the user on.
    if (authError) setError(describeAuthError(authError));
    return !authError;
  }

  function signIn() {
    if (canSubmit) void signInWith(email, password);
  }

  // Try demo (OB.3): fill the seeded account so the judge sees what happens, then sign in. A judge set takes its
  // seat first (the backend resets the set for a new judge), and in the split view the other phone signs in too.
  async function tryDemo(role: Role) {
    if (!isDemoEnabled || !isSupabaseConfigured || submitting) return;
    if (judging) {
      if (!seatKey) {
        setError(BUSY);
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        await takeSeat(seatKey);
      } catch (seatError) {
        setSubmitting(false);
        setError(seatError instanceof Error ? seatError.message : "Try again.");
        setSeatPick(null);
        return;
      }
    }
    const { email: demoEmail } = demoSetFor(setKey)[role];
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    if ((await signInWith(demoEmail, DEMO_PASSWORD)) && judging) postJudgeSeat(setKey, role);
  }

  // /login?demo=owner|sitter does the same (desktop side panel 10.9, split view 10.10). A judge waits for the seats.
  useEffect(() => {
    if (demoTried.current || !isDemoRole(params.demo) || (judging && seats === null)) return;
    demoTried.current = true;
    void tryDemo(params.demo);
    // Once per visit; tryDemo reads the seats, which this waits for.
  }, [params.demo, seats]);

  return (
    <Screen contentStyle={styles.content}>
      <BackLink onPress={() => router.push("/welcome")} testID="login-back" />

      <View style={styles.body}>
        <BrandLogo height={32} />
        <View style={styles.header}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Log in to see today with your pet.</Text>
        </View>

        {!isSupabaseConfigured ? (
          <Card>
            <Text style={styles.error}>{SUPABASE_NOT_CONFIGURED}</Text>
          </Card>
        ) : null}

        <View style={styles.form}>
          <SocialSignIn divider="or with email" testID="login" />
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
            <Text
              accessibilityRole="alert"
              style={styles.error}
              testID="login-error"
            >
              {error}
            </Text>
          ) : null}
          <Button
            label={submitting ? "Logging in…" : "Log in"}
            onPress={signIn}
            disabled={!canSubmit}
            testID="sign-in"
          />
        </View>

        {isDemoEnabled ? (
          <View style={styles.demo} testID="demo-block">
            <OrDivider label="or try the demo" />
            {isDemoToolsBuild ? (
              <Select
                label="Whose demo"
                value={team}
                options={[
                  ...TEAM_SETS.map((set) => ({ value: set.key, label: set.label })),
                  { value: JUDGES, label: "Judge seats" },
                ]}
                onChange={setTeam}
                testID="demo-set"
              />
            ) : null}
            {judging ? (
              <ChoiceChips
                options={JUDGE_SETS.map((set) => {
                  const seat = seats?.find((s) => s.set === set.key);
                  const taken = Boolean(seat?.inUse && !seat.mine);
                  return { value: set.key, label: taken ? `${set.label} · In use` : set.label, disabled: taken };
                })}
                value={seatKey ? [seatKey] : []}
                onChange={(picked) => setSeatPick(picked[0] ?? null)}
                testID="judge-seat"
              />
            ) : null}
            {judging && allBusy ? (
              <Text style={styles.hint} testID="judge-seats-busy">
                {BUSY}
              </Text>
            ) : null}
            {seatNotice && judging ? (
              <Text style={styles.error} testID="judge-seat-notice">
                {seatNotice}
              </Text>
            ) : null}
            <View style={styles.demoButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Demo owner, ${demoSet.owner.name}`}
                onPress={() => void tryDemo("owner")}
                disabled={submitting || !isSupabaseConfigured}
                style={({ pressed }) => [styles.demoTile, styles.demoOwner, pressed && styles.pressed]}
                testID="demo-owner"
              >
                <RoleArt role="owner" size={52} />
                <Text style={styles.demoLabel}>Owner</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Demo sitter, ${demoSet.sitter.name}`}
                onPress={() => void tryDemo("sitter")}
                disabled={submitting || !isSupabaseConfigured}
                style={({ pressed }) => [styles.demoTile, styles.demoSitter, pressed && styles.pressed]}
                testID="demo-sitter"
              >
                <RoleArt role="sitter" size={52} />
                <Text style={styles.demoLabel}>Sitter</Text>
              </Pressable>
            </View>
            <Text style={styles.hint} testID="demo-hint">
              {`Demo accounts: ${demoSet.owner.name} with ${demoSet.pets[0]} and ${demoSet.pets[1]}, booked with ${demoSet.sitter.name}.`}
            </Text>
          </View>
        ) : null}

        <TextButton
          label="New here? Create an account"
          onPress={() => router.push("/signup")}
          testID="go-signup"
        />
      </View>
    </Screen>
  );
}

const JUDGES = "judges";
const BUSY = "All judge seats are busy. Try again in a few minutes.";

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.sm,
    },
    body: {
      flexGrow: 1,
      justifyContent: "center",
      gap: theme.spacing.lg,
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
    form: {
      gap: theme.spacing.md,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
    demo: {
      gap: theme.spacing.md,
    },
    demoButtons: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    demoTile: {
      flex: 1,
      minHeight: 72,
      borderRadius: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
    },
    demoOwner: { backgroundColor: theme.color.blockPeach },
    demoSitter: { backgroundColor: theme.color.blockMint },
    pressed: { opacity: 0.85 },
    demoLabel: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.bold,
      color: theme.color.text,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      textAlign: "center",
    },
  });
