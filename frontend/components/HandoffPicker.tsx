import { StyleSheet, Text, View } from "react-native";

import { CheckRow } from "./ui/CheckRow";
import { Stepper } from "./ui/Stepper";
import { TextField } from "./ui/TextField";
import { addDays, formatDay, formatTime, shiftTime } from "../features/schedule/dates";
import { LocationType } from "../lib/bookings";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

export type HandoffDraft = { day: string; time: string; locationType: LocationType; note: string };

const TIME_STEP = 15;

type Props = {
  kind: "drop_off" | "pick_up";
  value: HandoffDraft;
  onChange: (value: HandoffDraft) => void;
  /** Earliest day the − button reaches (today for drop-off, the drop-off day for pick-up). */
  minDay: string;
  /** "Mina" once a sitter is picked, else "the sitter". */
  sitterName: string | null;
};

/** Where the pets change hands = who drives (D28): sitter_home = Owner drives, owner_home = Sitter drives. */
function placeOptions(kind: Props["kind"], sitter: string | null): { value: LocationType; label: string }[] {
  const at = sitter ? `${sitter}'s place` : "the sitter's place";
  const who = sitter ?? "The sitter";
  return kind === "drop_off"
    ? [
        { value: "sitter_home", label: `🚗 I'll drive — at ${at}` },
        { value: "owner_home", label: `🚙 ${who} picks up — at my place` },
        { value: "other", label: "📍 Somewhere else" },
      ]
    : [
        { value: "sitter_home", label: `🚗 I'll pick up — at ${at}` },
        { value: "owner_home", label: `🚙 ${who} brings them home — to my place` },
        { value: "other", label: "📍 Somewhere else" },
      ];
}

/** Day (± 1 day), time (± 15 min) and place for one handoff — no native pickers (DESIGN.md §7.7). */
export function HandoffPicker({ kind, value, onChange, minDay, sitterName }: Props) {
  const styles = useThemedStyles(makeStyles);
  const title = kind === "drop_off" ? "Drop-off" : "Pick-up";
  const set = (change: Partial<HandoffDraft>) => onChange({ ...value, ...change });

  return (
    <View style={styles.root} testID={`handoff-${kind}`}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <View style={styles.when}>
        <Stepper
          label={`${title} day`}
          value={formatDay(value.day)}
          onDecrease={() => set({ day: addDays(value.day, -1) })}
          onIncrease={() => set({ day: addDays(value.day, 1) })}
          canDecrease={value.day > minDay}
          testID={`${kind}-day`}
        />
        <Stepper
          label={`${title} time`}
          value={formatTime(value.time)}
          onDecrease={() => set({ time: shiftTime(value.time, -TIME_STEP) })}
          onIncrease={() => set({ time: shiftTime(value.time, TIME_STEP) })}
          testID={`${kind}-time`}
        />
      </View>
      <View accessibilityRole="radiogroup">
        {placeOptions(kind, sitterName).map((option) => (
          <CheckRow
            key={option.value}
            radio
            label={option.label}
            checked={value.locationType === option.value}
            onChange={() => set({ locationType: option.value })}
            testID={`${kind}-place-${option.value}`}
          />
        ))}
      </View>
      {value.locationType === "other" ? (
        <TextField
          label="Where to meet"
          placeholder="e.g. Trinity Bellwoods Park, north gate"
          value={value.note}
          onChangeText={(note) => set({ note })}
          maxLength={120}
          testID={`${kind}-note`}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      gap: theme.spacing.sm,
    },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    when: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
    },
  });
