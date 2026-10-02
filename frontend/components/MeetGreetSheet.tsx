import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { CheckRow } from "./ui/CheckRow";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Sheet } from "./ui/Sheet";
import { Stepper } from "./ui/Stepper";
import { TextField } from "./ui/TextField";
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
  /** Who gets the suggestion ("Send to Lucy"). */
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
  const start = current.at ? isoToZoned(current.at) : { day: addDays(appToday(), 1), time: "19:00" };
  const known = [...spots.ownerSpots, ...spots.sitterSpots];

  const [mode, setMode] = useState<MeetGreetMode>(current.mode ?? "in_person");
  const [day, setDay] = useState(start.day);
  const [time, setTime] = useState(start.time);
  const [spot, setSpot] = useState<string>(
    current.place ? (known.includes(current.place) ? current.place : OTHER) : (known[0] ?? OTHER),
  );
  const [other, setOther] = useState(current.place && !known.includes(current.place) ? current.place : "");

  const at = zonedToIso(day, time);
  const place = mode === "in_person" ? (spot === OTHER ? other.trim() : spot) : null;
  const problem =
    Date.parse(at) <= Date.now()
      ? "Pick a time in the future."
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
              placeholder="A park entrance or café — not a home address"
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
          label="Meet & Greet day"
          value={formatDay(day)}
          onDecrease={() => setDay(addDays(day, -1))}
          onIncrease={() => setDay(addDays(day, 1))}
          canDecrease={day > appToday()}
          testID="meet-day"
        />
        <Stepper
          label="Meet & Greet time"
          value={formatTime(time)}
          onDecrease={() => setTime(shiftTime(time, -TIME_STEP))}
          onIncrease={() => setTime(shiftTime(time, TIME_STEP))}
          testID="meet-time"
        />
      </View>
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
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
