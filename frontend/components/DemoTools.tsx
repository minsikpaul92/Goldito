import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DEMO_STATES, DemoState, resetDemo } from "../lib/demoReset";
import { homeFor, useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { CheckRow } from "./ui/CheckRow";
import { Sheet } from "./ui/Sheet";
import { TextButton } from "./ui/TextButton";

/**
 * Testing only (profile, demo accounts, EXPO_PUBLIC_DEMO_TOOLS=1): put the demo back into a
 * chosen state. It deletes the demo accounts' data, so a sheet asks first. Not for judges.
 */
export function DemoTools() {
  const styles = useThemedStyles(makeStyles);
  const session = useSession();
  const toast = useToast();
  const [state, setState] = useState<DemoState>("pets");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = DEMO_STATES.find((s) => s.value === state)!;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await resetDemo(state);
      setAsking(false);
      toast.show(`Demo reset: ${chosen.label}`);
      // Every screen cached the old data; start again from Home.
      if (session.profile) router.replace(homeFor(session.profile.role));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.group} testID="demo-tools">
      <Text style={styles.title}>Demo tools (testing only)</Text>
      <Text style={styles.muted}>Start over from a known point. This clears what the two demo accounts did together: bookings, inquiries, notices and reports. Other accounts' data stays.</Text>
      {DEMO_STATES.map((option) => (
        <CheckRow
          key={option.value}
          radio
          label={option.label}
          hint={option.hint}
          checked={state === option.value}
          onChange={() => setState(option.value)}
          testID={`demo-state-${option.value}`}
        />
      ))}
      <TextButton label="Reset demo…" onPress={() => setAsking(true)} danger testID="demo-reset-open" />
      <Sheet visible={asking} title="Reset the demo?" onClose={() => (busy ? undefined : setAsking(false))} testID="demo-reset-sheet">
        <Text style={styles.body}>{`Both demo accounts go back to “${chosen.label}”. Their bookings, inquiries, notices and reports with each other are deleted. This can't be undone.`}</Text>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="demo-reset-error">
            {error}
          </Text>
        ) : null}
        <Button label={busy ? "Resetting…" : "Reset now"} onPress={() => void run()} disabled={busy} testID="demo-reset-confirm" />
      </Sheet>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    group: {
      gap: theme.spacing.sm,
      paddingTop: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
    },
    title: { fontSize: theme.fontSize.body, fontWeight: "600", color: theme.color.text },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
  });
