import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { CheckRow } from "./ui/CheckRow";
import { DayPickerSheet } from "./ui/DayPickerSheet";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Sheet } from "./ui/Sheet";
import { Stepper } from "./ui/Stepper";
import { TextField } from "./ui/TextField";
import { TimePickerSheet } from "./ui/TimePickerSheet";
import { addDays, appToday, formatDay, formatTime, isoToZoned, shiftTime, zonedToIso } from "../features/schedule/dates";
import { BookingSummary } from "../lib/bookings";
import { MeetGreetMode, MeetSpots } from "../lib/meetGreet";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

const TIME_STEP = 15;
const OTHER = "__other__";

type Props = {
  visible: boolean;
  booking: BookingSummary;
  spots: MeetSpots;
  /** Who gets the suggestion ("Send to Chloe"). */
  otherName: string;
  onSubmit: (mode: MeetGreetMode, at: string, place: string | null) => void;
  onClose: () => void;
};

/**
 * Schedule (or reschedule) the Meet & Greet (3B.9, D44): In person at one of both sides'
 * preferred public spots or somewhere typed in one line, or Video (the Google Meet link
 * arrives once the other side agrees, 3B.11). Home addresses never show here (D31).
 */
export function MeetGreetSheet({ visible, booking, spots, otherName, onSubmit, onClose }: Props) {
  const styles = useThemedStyles(makeStyles);
  const current = booking.meetGreet;
  // The Meet & Greet comes before the drop-off (015f, #236).
  const dropAt = booking.dropOff ? Date.parse(booking.dropOff.at) : null;
  const lastDay = booking.dropOff ? isoToZoned(booking.dropOff.at).day : undefined;
  const start = current.at ? isoToZoned(current.at) : firstGuess(dropAt);
  const known = [...spots.ownerSpots, ...spots.sitterSpots];

  const [mode, setMode] = useState<MeetGreetMode>(current.mode ?? "in_person");
  const [day, setDay] = useState(start.day);
  const [time, setTime] = useState(start.time);
  const [spot, setSpot] = useState<string>(
    current.place ? (known.includes(current.place) ? current.place : OTHER) : (known[0] ?? OTHER),
  );
  const [other, setOther] = useState(current.place && !known.includes(current.place) ? current.place : "");
  /** Tap the day for the calendar, the time for the clock (DESIGN.md §7.10, #229: any minute, not only 15 minute steps). */
  const [picker, setPicker] = useState<"day" | "time" | null>(null);

  const at = zonedToIso(day, time);
  const place = mode === "in_person" ? (spot === OTHER ? other.trim() : spot) : null;
  const problem =
    Date.parse(at) <= Date.now()
      ? "Pick a time in the future."
      : dropAt !== null && Date.parse(at) >= dropAt
        ? "Pick a time before the drop-off."
        : mode === "in_person" && !place
        ? "Pick a place to meet."
        : null;

  const spotRow = (label: string, owner: string) => (
    <CheckRow
      key={`${owner}-${label}`}
      radio
      label={label}
      hint={`${owner}'s spot`}
      checked={spot === label}
      onChange={() => setSpot(label)}
      testID={`meet-spot-${label}`}
    />
  );

  return (
    <Sheet
      dirty={other.trim() !== ""}
      discardTitle="Discard this place?"
      visible={visible}
      title="Schedule Meet & Greet"
      onClose={onClose}
      testID="meet-sheet"
      footer={
        <Button
          label={`Send to ${otherName}`}
          onPress={() => !problem && onSubmit(mode, at, place)}
          disabled={!!problem}
          testID="meet-send"
        />
      }
    >
      <SegmentedControl
        options={[
          { value: "in_person", label: "In person" },
          { value: "video", label: "Video" },
        ]}
        value={mode}
        onChange={setMode}
        testID="meet-mode"
      />
      {mode === "in_person" ? (
        <View accessibilityRole="radiogroup">
          {spots.ownerSpots.map((s) => spotRow(s, spots.ownerName))}
          {spots.sitterSpots.map((s) => spotRow(s, spots.sitterName))}
          <CheckRow
            radio
            label="📍 Somewhere else"
            checked={spot === OTHER}
            onChange={() => setSpot(OTHER)}
            testID="meet-spot-other"
          />
          {spot === OTHER ? (
            <TextField
              label="Where to meet"
              placeholder="A park entrance or café, not a home"
              value={other}
              onChangeText={setOther}
              maxLength={120}
              testID="meet-place"
            />
          ) : null}
        </View>
      ) : (
        <Text style={styles.hint}>A Google Meet link appears on both phones once it's agreed.</Text>
      )}
      <View style={styles.row}>
        <Stepper
          style={styles.stepper}
          label="Meet & Greet day"
          value={formatDay(day)}
          onDecrease={() => setDay(addDays(day, -1))}
          onIncrease={() => setDay(addDays(day, 1))}
          canDecrease={day > appToday()}
          canIncrease={!lastDay || day < lastDay}
          onPressValue={() => setPicker("day")}
          testID="meet-day"
        />
        <Stepper
          style={styles.stepper}
          label="Meet & Greet time"
          value={formatTime(time)}
          onDecrease={() => setTime(shiftTime(time, -TIME_STEP))}
          onIncrease={() => setTime(shiftTime(time, TIME_STEP))}
          onPressValue={() => setPicker("time")}
          testID="meet-time"
        />
      </View>
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}

      <DayPickerSheet
        visible={picker === "day"}
        title="Meet & Greet day"
        value={day}
        minDay={appToday()}
        maxDay={lastDay}
        onPick={(d) => {
          setDay(d);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        testID="meet-calendar-sheet"
      />
      <TimePickerSheet
        visible={picker === "time"}
        title="Meet & Greet time"
        value={time}
        onPick={(t) => {
          setTime(t);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        testID="meet-clock"
      />
    </Sheet>
  );
}

/** Tomorrow evening, or the evening before the drop-off when that is sooner (else an hour before it). */
function firstGuess(dropAt: number | null): { day: string; time: string } {
  const tomorrow = { day: addDays(appToday(), 1), time: "19:00" };
  if (dropAt === null || Date.parse(zonedToIso(tomorrow.day, tomorrow.time)) < dropAt) return tomorrow;
  const drop = isoToZoned(new Date(dropAt).toISOString());
  const eve = { day: addDays(drop.day, -1), time: "19:00" };
  if (Date.parse(zonedToIso(eve.day, eve.time)) > Date.now()) return eve;
  return isoToZoned(new Date(dropAt - 60 * 60_000).toISOString());
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    stepper: {
      flex: 1,
      minWidth: 0,
      justifyContent: "space-between",
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    problem: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
  });
