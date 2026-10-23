import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { TextButton } from "./ui/TextButton";
import { ReturnChecks, loadReturnChecks } from "../features/completion/returnChecks";
import { formatInstant } from "../features/schedule/dates";
import { BookingSummary, EARLY_RETURN_MS } from "../lib/bookings";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  visible: boolean;
  booking: BookingSummary;
  ownerName: string;
  /** The sitter pressed Return: the caller completes the pick-up. The sheet closes itself first. */
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Returning the pets (Returned): what is still open today (tasks, the day's note) and the "really?" when it is early.
 * Used by the booking page and by the chat.
 */
export function ReturnSheet({ visible, booking, ownerName, onConfirm, onClose }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [checks, setChecks] = useState<ReturnChecks | null>(null);
  const petNames = booking.pets.map((p) => p.name).join(" & ") || "The pets";
  const early = booking.pickUp != null && Date.now() < Date.parse(booking.pickUp.at) - EARLY_RETURN_MS;

  useEffect(() => {
    if (!visible) return;
    setChecks(null);
    void loadReturnChecks(booking.pets, booking.sitterId).then(setChecks).catch(() => undefined);
    // read once each time the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Sheet
      visible={visible}
      title={`Return ${petNames}?`}
      onClose={onClose}
      testID="return-sheet"
      footer={
        <View style={styles.actions}>
          <Button
            label="Return"
            variant={early ? "danger" : "primary"}
            onPress={() => {
              onClose();
              onConfirm();
            }}
            testID="return-confirm"
          />
          <Button label="Cancel" variant="secondary" onPress={onClose} testID="return-cancel" />
        </View>
      }
    >
      {early && booking.pickUp ? (
        <Text style={styles.warning} testID="return-early-warning">
          {`It's not pick-up time yet (pick-up is ${formatInstant(booking.pickUp.at)}). Do you really want to return ${petNames} now?`}
        </Text>
      ) : null}
      <Text style={styles.body}>{`${petNames} ${booking.pets.length > 1 ? "go" : "goes"} home with ${ownerName}. This can't be undone, and it writes the Life Record.`}</Text>
      {checks && checks.tasksLeft > 0 ? (
        <Text style={styles.body} testID="return-tasks-left">
          {`• ${checks.tasksLeft} care task${checks.tasksLeft === 1 ? "" : "s"} still open today`}
        </Text>
      ) : null}
      {checks && checks.petsWithoutNote.length > 0 ? (
        <>
          <Text style={styles.body} testID="return-note-missing">
            {`• You haven't sent today's note for ${checks.petsWithoutNote.join(" & ")}`}
          </Text>
          <TextButton
            label="Send today's note first"
            onPress={() => {
              onClose();
              router.push("/sitter/feed?view=diary");
            }}
            testID="return-send-note"
          />
        </>
      ) : null}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    actions: { gap: theme.spacing.sm },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    warning: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.warning },
  });
