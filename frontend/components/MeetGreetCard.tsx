import { ReactNode, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Viewer } from "./BookingCard";
import { MeetGreetSheet } from "./MeetGreetSheet";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { CheckRow } from "./ui/CheckRow";
import { Icon } from "./ui/Icon";
import { LinkButton } from "./ui/LinkButton";
import { Sheet } from "./ui/Sheet";
import { TextButton } from "./ui/TextButton";
import { formatInstant } from "../features/schedule/dates";
import { BookingSummary, awaitingFirstYes, datesOnHold } from "../lib/bookings";
import {
  MeetGreetMode,
  MeetSpots,
  meetGreetCalendarUrl,
  completeMeetGreet,
  getMeetGreetOptions,
  meetGreetPrimary,
  proposeMeetGreet,
  releaseVideoLink,
  requestSkipMeetGreet,
  requestVideoLink,
  respondMeetGreet,
  respondSkipMeetGreet,
  declineMeetGreet,
} from "../lib/meetGreet";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

/** Things to go over together at an in-person Meet & Greet, a local checklist (3B.9). A video call has none (#229). */
const CHECKLIST = ["Care needs", "Quirks", "Route", "Handoff", "Heads-up"];

type Props = {
  booking: BookingSummary;
  viewer: Viewer;
  /** Reload the booking after a change. */
  onChanged: () => Promise<void> | void;
  /** The chat footer carries the main button (Pick a time, Accept, Done, Continue); the card keeps the rest. */
  hidePrimary?: boolean;
  /** In the chat a finished Meet & Greet draws nothing: its "done" message already says so. */
  inChat?: boolean;
};

/** What the chat footer can ask of the card: do the step that is this person's turn. */
export type MeetGreetHandle = { primary: () => void; skip: () => void; open: () => void };

export function meetGreetSummary(b: BookingSummary): string | null {
  const { mode, at, place } = b.meetGreet;
  if (!mode || !at) return null;
  return mode === "video" ? `Online · ${formatInstant(at)}` : `In person · ${place ?? ""} · ${formatInstant(at)}`;
}

/**
 * Meet & Greet on a first-time booking (DESIGN.md MeetGreetCard, phase-03b 3B.9, D44):
 * to schedule → proposed → agreed (Join Google Meet / Add to calendar) → Done. The owner may
 * ask first: Request or Skip Meet & Greet (015f, #236). A time or a skip request is answered
 * with Accept, the other choice, or Decline (ends the request).
 */
export const MeetGreetCard = forwardRef<MeetGreetHandle, Props>(function MeetGreetCard(
  { booking, viewer, onChanged, hidePrimary, inChat },
  ref,
) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ key: number; spots: MeetSpots } | null>(null);
  const [confirm, setConfirm] = useState<"skip" | "decline" | "done-early" | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const primaryRef = useRef<() => void>(() => undefined);
  useImperativeHandle(ref, () => ({ primary: () => primaryRef.current(), skip: () => setConfirm("skip"), open: () => openRef.current() }), []);
  const openRef = useRef<() => void>(() => undefined);

  const status = booking.meetGreetStatus;
  if (status === "not_needed") return null;

  const me = viewer === "owner" ? booking.ownerId : booking.sitterId;
  const other = viewer === "owner" ? booking.sitterName : booking.ownerName;
  const open = booking.status === "requested";
  const mg = booking.meetGreet;
  const summary = meetGreetSummary(booking);
  const calendarUrl = meetGreetCalendarUrl(booking);
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

  openRef.current = () => void openSheet();

  const send = (mode: MeetGreetMode, at: string, place: string | null) => {
    setSheet(null);
    void run(async () => {
      await proposeMeetGreet(booking.id, mode, at, place);
      // Moving a video call in person drops its Calendar event (a new video time keeps it).
      if (mode === "in_person" && mg.mode === "video") await releaseVideoLink(booking.id);
    }, `Meet request sent to ${other}`);
  };

  const markDone = () => void run(() => completeMeetGreet(booking.id), "Meet done");
  // Done works any time after it is agreed (014s, #229); before the agreed time it asks first.
  const pressDone = () => (timeHasCome ? markDone() : setConfirm("done-early"));

  primaryRef.current = () => {
    const step = meetGreetPrimary(booking, viewer);
    if (!step || busy) return;
    if (step.key === "schedule") void openSheet();
    else if (step.key === "accept")
      void run(async () => {
        await respondMeetGreet(booking.id, true);
        if (mg.mode === "video") await requestVideoLink(booking.id);
      }, `Meet set with ${other}`);
    else if (step.key === "done") pressDone();
    else void run(() => respondSkipMeetGreet(booking.id, true), "Meet skipped");
  };

  // "Met": the update line already says it was done, so the folded card adds nothing.
  if (status === "done" && inChat) return null;
  if (status === "done" || status === "skipped" || !open) {
    const line =
      status === "done"
        ? `Met${summary ? ` · ${summary}` : ""}`
        : status === "skipped"
          ? "Meet skipped, you both agreed"
          : `Meet: ${summary ?? "not scheduled"}`;
    if (inChat) {
      return (
        <Card style={StyleSheet.flatten([styles.card, styles.folded])} tone="blush" testID="meet-greet">
          <Text style={styles.foldedText}>{line}</Text>
        </Card>
      );
    }
    // On the booking pages it is information, not a button: a plain card with an icon and the line (polish B, Oct 28).
    return (
      <Card testID="meet-greet">
        <View style={styles.infoRow}>
          <Icon
            name={status === "done" ? "selected" : status === "skipped" ? "skipped" : "calendar"}
            size={20}
            color={theme.color.textMuted}
          />
          <Text style={styles.infoText}>{line}</Text>
        </View>
      </Card>
    );
  }

  // The chat has its own, shorter card (Skip, Request, Accept); the booking pages keep the full one.
  const stalled = !!booking.meetGreetDueAt && Date.parse(booking.meetGreetDueAt) <= Date.now();
  const holdLine = datesOnHold(booking)
    ? viewer === "owner"
      ? `${other} is holding your dates while you arrange this.`
      : `These dates are on hold for ${other}.`
    : null;

  let legacyBody: ReactNode = null;
  if (status === "required" && awaitingFirstYes(booking) && viewer === "owner") {
    // The owner's choice right after Request booking (015f, #236). Both buttons stay on the card, also in the chat.
    legacyBody = (
      <>
        <Text style={styles.title}>Meet</Text>
        <View style={styles.pair}>
          <Button label="Skip" variant="secondary" onPress={() => setConfirm("skip")} disabled={busy} style={styles.half} testID="meet-skip" />
          <Button label="Request" onPress={() => void openSheet()} disabled={busy} style={styles.half} testID="meet-request" />
        </View>
      </>
    );
  } else if (status === "required" && awaitingFirstYes(booking)) {
    // Nothing can be planned until the sitter says yes to meeting (D60) — the sitter's button is in the footer.
    legacyBody = (
      <>
        <Text style={styles.title}>Meet before the first stay</Text>
        <Text style={styles.muted}>
          {viewer === "sitter"
            ? `Tap Next to hold these dates, then meet ${other} or agree to skip.`
            : `Waiting for ${other} to say yes to meeting. Your dates are held once they do.`}
        </Text>
      </>
    );
  } else if (status === "required") {
    legacyBody = (
      <>
        <Text style={styles.title}>{stalled ? "Still no time to meet" : "Set a time to meet"}</Text>
        {holdLine ? <Text style={styles.muted}>{holdLine}</Text> : null}
        <Text style={styles.muted}>
          {stalled
            ? "Set a time, skip the meet, or decline. With no answer in 3 days the booking is cancelled."
            : `Pick a time with ${other}, or agree to skip the meet.`}
        </Text>
        {hidePrimary ? null : <Button label="Schedule a meet" onPress={() => void openSheet()} disabled={busy} testID="meet-schedule" />}
        <TextButton label="Skip the meet" onPress={() => setConfirm("skip")} style={styles.left} testID="meet-skip" />
      </>
    );
  } else if (status === "proposed" && mg.proposedBy === me) {
    legacyBody = (
      <>
        <Text style={styles.title}>{`Waiting for ${other}`}</Text>
        <Text style={styles.body}>{summary}</Text>
        <View style={styles.links}>
          <TextButton label="Change" onPress={() => void openSheet()} testID="meet-change" />
          <TextButton label="Skip the meet" onPress={() => setConfirm("skip")} testID="meet-skip" />
        </View>
      </>
    );
  } else if (status === "proposed") {
    legacyBody = (
      <>
        <Text style={styles.title}>{`${other} suggested a meet`}</Text>
        <Text style={styles.body}>{summary}</Text>
        {hidePrimary ? null : (
          <Button
            label="Accept"
            onPress={() =>
              void run(async () => {
                await respondMeetGreet(booking.id, true);
                // Video: the Google Meet link is made right away (3B.11); without Google it stays time + Add to calendar.
                if (mg.mode === "video") await requestVideoLink(booking.id);
              }, `Meet set with ${other}`)
            }
            disabled={busy}
            testID="meet-accept"
          />
        )}
        <View style={styles.links}>
          <TextButton label="Suggest another time" onPress={() => void openSheet()} testID="meet-counter" />
          <TextButton label="Request skip" onPress={() => setConfirm("skip")} testID="meet-skip" />
          <TextButton label="Decline" danger onPress={() => setConfirm("decline")} testID="meet-decline" />
        </View>
      </>
    );
  } else if (status === "agreed") {
    legacyBody = (
      <>
        <Text style={styles.title}>Meet set</Text>
        <Text style={styles.body}>{summary}</Text>
        {mg.mode === "video" ? (
          mg.link ? (
            <LinkButton label="Join Google Meet" href={mg.link} testID="meet-join" />
          ) : (
            <View style={styles.links}>
              <Text style={styles.muted}>No Google Meet link yet. The time and Add to calendar still work.</Text>
              <TextButton
                label="Get the Meet link"
                onPress={() =>
                  void run(async () => {
                    if (!(await requestVideoLink(booking.id))) throw new Error("The Google Meet link isn't ready yet. Try again later.");
                  }, "Google Meet link ready")
                }
                testID="meet-link-retry"
              />
            </View>
          )
        ) : (
          <>
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
          </>
        )}
        {hidePrimary ? null : <Button label="Done, we met" onPress={pressDone} disabled={busy} testID="meet-done" />}
        <View style={styles.links}>
          {calendarUrl ? <LinkButton label="Add to calendar" href={calendarUrl} look="text" testID="meet-calendar" /> : null}
          <TextButton label="Change" onPress={() => void openSheet()} testID="meet-change" />
        </View>
      </>
    );
  } else if (status === "skip_requested" && mg.skipRequestedBy === me) {
    legacyBody = (
      <>
        <Text style={styles.title}>{`Waiting for ${other}`}</Text>
        <Text style={styles.muted}>You asked to skip the meet.</Text>
      </>
    );
  } else if (status === "skip_requested") {
    legacyBody = (
      <>
        <Text style={styles.title}>{`${other} would like to skip the meet`}</Text>
        {hidePrimary ? null : (
          <Button
            label="Accept skip"
            onPress={() => void run(() => respondSkipMeetGreet(booking.id, true), "Meet skipped")}
            disabled={busy}
            testID="meet-skip-accept"
          />
        )}
        <View style={styles.links}>
          <TextButton label="Ask to meet" onPress={() => void openSheet()} testID="meet-skip-counter" />
          <TextButton label="Decline" danger onPress={() => setConfirm("decline")} testID="meet-skip-decline" />
        </View>
      </>
    );
  }

  let chatBody: ReactNode = null;
  if (status === "required") {
    // Either side starts here (the booking is the chat's first request): Skip on the left, Request on the right.
    chatBody = (
      <>
        <Text style={[styles.title, styles.center]}>Meet</Text>
        <View style={styles.pair}>
          <Button label="Skip" variant="secondary" onPress={() => setConfirm("skip")} disabled={busy} style={styles.half} testID="meet-skip" />
          <Button label="Request" onPress={() => void openSheet()} disabled={busy} style={styles.half} testID="meet-request" />
        </View>
      </>
    );
  } else if (status === "proposed" && mg.proposedBy === me) {
    chatBody = (
      <>
        <Text style={styles.title}>{`Waiting for ${other}`}</Text>
        <Text style={styles.body}>{summary}</Text>
        <View style={styles.links}>
          <TextButton label="Modify" onPress={() => void openSheet()} testID="meet-change" />
        </View>
      </>
    );
  } else if (status === "proposed") {
    chatBody = (
      <>
        <Text style={styles.title}>Meet</Text>
        <Text style={styles.body}>{summary}</Text>
        <Button
          label="Accept"
          onPress={() =>
            void run(async () => {
              await respondMeetGreet(booking.id, true);
              // Online: the Google Meet link is made right away (3B.11); without Google it stays time + Add to calendar.
              if (mg.mode === "video") await requestVideoLink(booking.id);
            }, `Meet set with ${other}`)
          }
          disabled={busy}
          testID="meet-accept"
        />
        <View style={styles.pair}>
          <Button label="Skip Request" variant="secondary" onPress={() => setConfirm("skip")} disabled={busy} style={styles.half} testID="meet-skip" />
          <Button label="Modify" variant="secondary" onPress={() => void openSheet()} disabled={busy} style={styles.half} testID="meet-counter" />
        </View>
      </>
    );
  } else if (status === "agreed") {
    chatBody = (
      <>
        <Text style={styles.title}>Meet set</Text>
        <Text style={styles.body}>{summary}</Text>
        {mg.mode === "video" ? (
          mg.link ? (
            <LinkButton label="Join Google Meet" href={mg.link} testID="meet-join" />
          ) : (
            <View style={styles.links}>
              <Text style={styles.muted}>No Google Meet link yet. The time and Add to calendar still work.</Text>
              <TextButton
                label="Get the Meet link"
                onPress={() =>
                  void run(async () => {
                    if (!(await requestVideoLink(booking.id))) throw new Error("The Google Meet link isn't ready yet. Try again later.");
                  }, "Google Meet link ready")
                }
                testID="meet-link-retry"
              />
            </View>
          )
        ) : (
          <>
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
          </>
        )}
        {hidePrimary ? null : <Button label="Done, we met" onPress={pressDone} disabled={busy} testID="meet-done" />}
        <View style={styles.links}>
          {calendarUrl ? <LinkButton label="Add to calendar" href={calendarUrl} look="text" testID="meet-calendar" /> : null}
          <TextButton label="Change" onPress={() => void openSheet()} testID="meet-change" />
        </View>
      </>
    );
  } else if (status === "skip_requested" && mg.skipRequestedBy === me) {
    chatBody = (
      <>
        <Text style={styles.title}>{`Waiting for ${other}`}</Text>
        <Text style={styles.muted}>You asked to skip the meet.</Text>
      </>
    );
  } else if (status === "skip_requested") {
    chatBody = (
      <>
        <Text style={styles.title}>Meet</Text>
        <Text style={styles.body}>{`${other} would like to skip.`}</Text>
        <Button label="Accept" onPress={() => void run(() => respondSkipMeetGreet(booking.id, true), "Meet skipped")} disabled={busy} testID="meet-skip-accept" />
        <Button label="Request" variant="secondary" onPress={() => void openSheet()} disabled={busy} testID="meet-skip-counter" />
      </>
    );
  }

  const body = inChat ? chatBody : legacyBody;

  return (
    <Card style={inChat ? styles.cardChat : styles.card} tone="blush" testID="meet-greet">
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
        title="Skip the meet?"
        onClose={() => setConfirm(null)}
        testID="meet-skip-sheet"
        footer={
          <Button
            label="Ask to skip"
            onPress={() => {
              setConfirm(null);
              void run(() => requestSkipMeetGreet(booking.id), `Asked ${other} to skip the meet`);
            }}
            testID="meet-skip-confirm"
          />
        }
      >
        <Text style={styles.body}>{`${other} can accept, ask to meet, or decline.`}</Text>
      </Sheet>

      <Sheet
        visible={confirm === "done-early"}
        title="It is not time yet"
        onClose={() => setConfirm(null)}
        testID="meet-done-early-sheet"
        footer={
          <View style={styles.links}>
            <TextButton label="Cancel" onPress={() => setConfirm(null)} testID="meet-done-early-cancel" />
            <Button
              label="Yes, we met"
              onPress={() => {
                setConfirm(null);
                markDone();
              }}
              testID="meet-done-early-confirm"
            />
          </View>
        }
      >
        <Text style={styles.body}>{`Did you already meet ${other}?`}</Text>
      </Sheet>

      <Sheet
        visible={confirm === "decline"}
        title="Decline this request?"
        onClose={() => setConfirm(null)}
        testID="meet-decline-sheet"
        footer={
          <Button
            label="Decline request"
            variant="danger"
            onPress={() => {
              setConfirm(null);
              void run(async () => {
                if (status === "skip_requested") await respondSkipMeetGreet(booking.id, false);
                else await declineMeetGreet(booking.id);
                await releaseVideoLink(booking.id);
              }, "Request declined");
            }}
            testID="meet-decline-confirm"
          />
        }
      >
        <Text style={styles.body}>
          {viewer === "owner" ? "This ends the booking request. You can book another sitter." : `This ends ${other}'s booking request.`}
        </Text>
      </Sheet>
    </Card>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      gap: theme.spacing.sm,
    },
    // In the chat: 92% wide and centered like the other system cards.
    cardChat: {
      gap: theme.spacing.sm,
      width: "92%",
      maxWidth: "92%",
      alignSelf: "center",
    },
    center: { textAlign: "center" },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    label: {
      fontSize: theme.fontSize.small,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.textMuted,
    },
    body: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    // The folded one-line card matches "Booked, you both agreed": 92% wide, one size, centered.
    folded: { width: "92%", maxWidth: "92%", alignSelf: "center" },
    foldedText: { fontSize: theme.fontSize.body, color: theme.color.text, textAlign: "center" },
    infoRow: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
    infoText: { flex: 1, fontSize: theme.fontSize.body, color: theme.color.text },
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
    pair: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    half: {
      flex: 1,
    },
  });
