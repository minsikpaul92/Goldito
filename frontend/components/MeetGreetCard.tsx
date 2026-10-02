import { ReactNode, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { Viewer } from "./BookingCard";
import { MeetGreetSheet } from "./MeetGreetSheet";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { CheckRow } from "./ui/CheckRow";
import { Sheet } from "./ui/Sheet";
import { TextButton } from "./ui/TextButton";
import { formatInstant } from "../features/schedule/dates";
import { BookingSummary } from "../lib/bookings";
import {
  MeetGreetMode,
  MeetSpots,
  addMeetGreetToCalendar,
  completeMeetGreet,
  getMeetGreetOptions,
  proposeMeetGreet,
  requestSkipMeetGreet,
  respondMeetGreet,
  respondSkipMeetGreet,
} from "../lib/meetGreet";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

/** Things to go over together at the Meet & Greet — a local checklist (3B.9). */
const CHECKLIST = ["Care needs", "Quirks", "Route", "Handoff", "Heads-up"];

type Props = {
  booking: BookingSummary;
  viewer: Viewer;
  /** Reload the booking after a change. */
  onChanged: () => Promise<void> | void;
};

export function meetGreetSummary(b: BookingSummary): string | null {
  const { mode, at, place } = b.meetGreet;
  if (!mode || !at) return null;
  return mode === "video" ? `Video · ${formatInstant(at)}` : `In person · ${place ?? ""} · ${formatInstant(at)}`;
}

/**
 * Meet & Greet on a first-time booking (DESIGN.md MeetGreetCard, phase-03b 3B.9, D44):
 * to schedule → proposed → agreed (Join Google Meet / Add to calendar) → Done; a skip
 * request asks the other side to Continue without meeting or Decline (cancels).
 */
export function MeetGreetCard({ booking, viewer, onChanged }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ key: number; spots: MeetSpots } | null>(null);
  const [confirm, setConfirm] = useState<"skip" | "decline-skip" | null>(null);
  const [checked, setChecked] = useState<string[]>([]);

  const status = booking.meetGreetStatus;
  if (status === "not_needed") return null;

  const me = viewer === "owner" ? booking.ownerId : booking.sitterId;
  const other = viewer === "owner" ? booking.sitterName : booking.ownerName;
  const open = booking.status === "requested";
  const mg = booking.meetGreet;
  const summary = meetGreetSummary(booking);
  const timeHasCome = !!mg.at && Date.parse(mg.at) <= Date.now();

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast.show(done);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openSheet = async () => {
    setError(null);
    setSheet({ key: Date.now(), spots: await getMeetGreetOptions(booking.id) });
  };

  const send = (mode: MeetGreetMode, at: string, place: string | null) => {
    setSheet(null);
    void run(() => proposeMeetGreet(booking.id, mode, at, place), `Meet & Greet sent to ${other}`);
  };

  if (status === "done" || status === "skipped" || !open) {
    return (
      <Card style={styles.card} testID="meet-greet">
        <Text style={styles.muted}>
          {status === "done"
            ? `Met ✓${summary ? ` — ${summary}` : ""}`
            : status === "skipped"
              ? "Meet & Greet skipped — you both agreed"
              : `Meet & Greet: ${summary ?? "not scheduled"}`}
        </Text>
      </Card>
    );
  }

  let body: ReactNode = null;
  if (status === "required") {
    body = (
      <>
        <Text style={styles.title}>First stay together — meet first</Text>
        <Text style={styles.muted}>
          {viewer === "sitter"
            ? `Meet ${other} first — or agree to skip the Meet & Greet.`
            : `${other} can accept once you've met — or you both agree to skip it.`}
        </Text>
        <Button label="Schedule Meet & Greet" onPress={() => void openSheet()} disabled={busy} testID="meet-schedule" />
        <TextButton label="Skip Meet & Greet" onPress={() => setConfirm("skip")} style={styles.left} testID="meet-skip" />
      </>
    );
  } else if (status === "proposed" && mg.proposedBy === me) {
    body = (
      <>
        <Text style={styles.title}>{`Waiting for ${other}`}</Text>
        <Text style={styles.body}>{summary}</Text>
        <View style={styles.links}>
          <TextButton label="Change" onPress={() => void openSheet()} testID="meet-change" />
          <TextButton label="Skip Meet & Greet" onPress={() => setConfirm("skip")} testID="meet-skip" />
        </View>
      </>
    );
  } else if (status === "proposed") {
    body = (
      <>
        <Text style={styles.title}>{`${other} suggested a Meet & Greet`}</Text>
        <Text style={styles.body}>{summary}</Text>
        <Button
          label="Accept"
          onPress={() => void run(() => respondMeetGreet(booking.id, true), `Meet & Greet set with ${other}`)}
          disabled={busy}
          testID="meet-accept"
        />
        <View style={styles.links}>
          <TextButton label="Suggest another time" onPress={() => void openSheet()} testID="meet-counter" />
          <TextButton
            label="Decline"
            danger
            onPress={() => void run(() => respondMeetGreet(booking.id, false), `${other} can suggest another time`)}
            testID="meet-decline"
          />
        </View>
      </>
    );
  } else if (status === "agreed") {
    body = (
      <>
        <Text style={styles.title}>Meet & Greet set ✅</Text>
        <Text style={styles.body}>{summary}</Text>
        {mg.mode === "video" ? (
          mg.link ? (
            <Button
              label="Join Google Meet"
              variant="secondary"
              onPress={() => void Linking.openURL(mg.link as string)}
              testID="meet-join"
            />
          ) : (
            <Text style={styles.muted}>The Google Meet link shows up here soon.</Text>
          )
        ) : null}
        <Text style={styles.label}>Go over together</Text>
        {CHECKLIST.map((item) => (
          <CheckRow
            key={item}
            label={item}
            checked={checked.includes(item)}
            onChange={(on) => setChecked((c) => (on ? [...c, item] : c.filter((x) => x !== item)))}
            testID={`meet-check-${item}`}
          />
        ))}
        {timeHasCome ? (
          <Button
            label="Done — we met"
            onPress={() => void run(() => completeMeetGreet(booking.id), "Meet & Greet done 🐾")}
            disabled={busy}
            testID="meet-done"
          />
        ) : (
          <Text style={styles.muted}>After you meet, tap Done here.</Text>
        )}
        <View style={styles.links}>
          <TextButton label="Add to calendar" onPress={() => addMeetGreetToCalendar(booking)} testID="meet-calendar" />
          <TextButton label="Change" onPress={() => void openSheet()} testID="meet-change" />
        </View>
      </>
    );
  } else if (status === "skip_requested" && mg.skipRequestedBy === me) {
    body = (
      <>
        <Text style={styles.title}>{`Waiting for ${other}`}</Text>
        <Text style={styles.muted}>{`You asked to skip the Meet & Greet. If ${other} says no, this booking is cancelled.`}</Text>
      </>
    );
  } else if (status === "skip_requested") {
    body = (
      <>
        <Text style={styles.title}>{`${other} would like to skip the Meet & Greet`}</Text>
        <Text style={styles.body}>Continue the booking without meeting first?</Text>
        <Button
          label="Continue without meeting"
          onPress={() => void run(() => respondSkipMeetGreet(booking.id, true), "Meet & Greet skipped")}
          disabled={busy}
          testID="meet-skip-accept"
        />
        <TextButton
          label="Decline — cancels the booking"
          danger
          onPress={() => setConfirm("decline-skip")}
          style={styles.left}
          testID="meet-skip-decline"
        />
      </>
    );
  }

  return (
    <Card style={styles.card} testID="meet-greet">
      {body}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error} testID="meet-error">
          {error}
        </Text>
      ) : null}

      {sheet ? (
        <MeetGreetSheet
          key={sheet.key}
          visible
          booking={booking}
          spots={sheet.spots}
          otherName={other}
          onSubmit={send}
          onClose={() => setSheet(null)}
        />
      ) : null}

      <Sheet
        visible={confirm === "skip"}
        title="Skip the Meet & Greet?"
        onClose={() => setConfirm(null)}
        testID="meet-skip-sheet"
        footer={
          <Button
            label="Ask to skip"
            onPress={() => {
              setConfirm(null);
              void run(() => requestSkipMeetGreet(booking.id), `Asked ${other} to skip the Meet & Greet`);
            }}
            testID="meet-skip-confirm"
          />
        }
      >
        <Text style={styles.body}>{`If ${other} says no, this booking will be cancelled.`}</Text>
      </Sheet>

      <Sheet
        visible={confirm === "decline-skip"}
        title="Meet first instead?"
        onClose={() => setConfirm(null)}
        testID="meet-decline-sheet"
        footer={
          <Button
            label="Decline and cancel the booking"
            onPress={() => {
              setConfirm(null);
              void run(() => respondSkipMeetGreet(booking.id, false), "Booking cancelled");
            }}
            testID="meet-decline-confirm"
          />
        }
      >
        <Text style={styles.body}>
          {viewer === "owner"
            ? "This cancels the booking request. You can book another sitter."
            : `This cancels the booking. ${other} gets a notice and can find another sitter.`}
        </Text>
      </Sheet>
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      gap: theme.spacing.sm,
    },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    label: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.textMuted,
    },
    body: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    muted: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
    links: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    left: {
      alignSelf: "flex-start",
      paddingHorizontal: 0,
    },
  });
