import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Sheet } from "../ui/Sheet";
import { openJudgeSplit } from "../shell/presentation";
import { JUDGE_SETS } from "../../lib/demo";
import { takeSeat } from "../../lib/judgeSeat";
import { isSupabaseConfigured } from "../../lib/supabase";
import { useJudgeSeats } from "../../lib/useJudgeSeats";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";

type Props = { visible: boolean; onClose: () => void };

const BUSY = "All judge seats are busy. Try again in a few minutes.";

/**
 * Try the demo (OB.3, #411): one tap on a Judge seat holds it for this browser until log out (or 10 minutes without
 * the app open), then both phones open side by side, the owner on the left and the sitter on the right.
 * A phone browser (no frame around the app) signs in as the owner.
 */
export function DemoSheet({ visible, onClose }: Props) {
  const styles = useThemedStyles(makeStyles);
  const seats = useJudgeSeats(visible && isSupabaseConfigured);
  const [taking, setTaking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allBusy = seats !== null && seats.every((s) => s.inUse && !s.mine);

  async function pick(set: string) {
    if (taking) return;
    setTaking(set);
    setError(null);
    try {
      await takeSeat(set);
    } catch (seatError) {
      setTaking(null);
      setError(seatError instanceof Error ? seatError.message : "Try again.");
      return;
    }
    if (typeof window !== "undefined" && window.top && window.top !== window) {
      // Inside the phone frame: the page around it opens both phones.
      openJudgeSplit(set);
      return;
    }
    setTaking(null);
    onClose();
    router.push(`/login?demo=owner&set=${set}`);
  }

  return (
    <Sheet visible={visible} title="Pick a judge seat" onClose={onClose} testID="demo-sheet">
      <View style={styles.body}>
        <Text style={styles.lead}>Yours until you log out.</Text>
        <View style={styles.grid}>
          {JUDGE_SETS.map((set) => {
            const seat = seats?.find((s) => s.set === set.key);
            const inUse = Boolean(seat?.inUse && !seat.mine);
            return (
              <Pressable
                key={set.key}
                accessibilityRole="button"
                accessibilityLabel={inUse ? `${set.label}, in use` : set.label}
                accessibilityState={{ disabled: inUse || taking !== null, busy: taking === set.key }}
                disabled={inUse || taking !== null || !isSupabaseConfigured}
                onPress={() => void pick(set.key)}
                style={({ pressed }) => [styles.seat, inUse && styles.seatInUse, pressed && styles.pressed]}
                testID={`demo-seat-${set.key}`}
              >
                <View style={styles.seatText}>
                  <Text style={styles.seatTitle}>{set.label}</Text>
                  {inUse ? <Text style={styles.seatSub}>In use</Text> : null}
                </View>
                {taking === set.key ? <ActivityIndicator /> : null}
              </Pressable>
            );
          })}
        </View>
        {allBusy ? (
          <Text style={styles.lead} testID="demo-seats-busy">
            {BUSY}
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="demo-seat-error">
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) => {
  const display = theme.fontFamily.display;
  return StyleSheet.create({
    body: { gap: theme.spacing.sm, paddingBottom: theme.spacing.md },
    lead: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    seat: {
      flexBasis: "47%",
      flexGrow: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.xl,
      minHeight: 72,
      backgroundColor: theme.color.blockPeach,
    },
    seatInUse: { opacity: 0.45 },
    pressed: { opacity: 0.85 },
    seatText: { flex: 1, gap: 2 },
    seatTitle: {
      fontSize: theme.fontSize.lead,
      color: theme.color.text,
      ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.bold }),
    },
    seatSub: { fontSize: theme.fontSize.small, color: theme.color.text },
  });
};
