import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatInstant } from "../features/schedule/dates";
import {
  BookingError,
  getHomeAccess,
  type HomeAccess,
  type HomeAccessLocked,
} from "../lib/bookings";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

type Props = {
  bookingId: string;
  /** Hide when this booking does not need owner-home access. */
  visible: boolean;
  /**
   * The owner's name when checkout was reopened by an agreed change (009d): the codes stay locked
   * until they sign the new consent, so say so instead of hiding the card.
   */
  waitingForSignature?: string | null;
};

const HIDE_MS = 10_000;

/**
 * Sitter entry-info card (03C): locked until T−2h, then Show code (auto-hides after 10 s).
 */
export function EntryInfoCard({ bookingId, visible, waitingForSignature }: Props) {
  const styles = useThemedStyles(makeStyles);
  // `code` is the RPC error code (not_paid, forbidden, …); `error` is the message to show.
  const [state, setState] = useState<
    HomeAccess | HomeAccessLocked | { error: string; code: string | null } | null
  >(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await getHomeAccess(bookingId);
        if (!cancelled) setState(result);
      } catch (err) {
        if (!cancelled) {
          setState({ error: (err as Error).message, code: err instanceof BookingError ? err.code : null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, visible]);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), HIDE_MS);
    return () => clearTimeout(t);
  }, [show]);

  if (!visible) return null;
  if (!state) {
    return (
      <Card style={styles.card} testID="entry-info-loading">
        <Text style={styles.muted}>Checking entry info…</Text>
      </Card>
    );
  }
  if ("error" in state) {
    if (state.code === "not_paid" && waitingForSignature) {
      return (
        <Card style={styles.card} testID="entry-info-waiting">
          <Text style={styles.title}>🔒 Entry info</Text>
          <Text style={styles.body}>{`Waiting for ${waitingForSignature} to sign`}</Text>
          <Text style={styles.muted}>
            The new plan needs their home-access consent. The codes open here once they sign.
          </Text>
        </Card>
      );
    }
    if (state.code === "forbidden" || state.code === "not_paid") return null;
    return (
      <Card style={styles.card} testID="entry-info-error">
        <Text style={styles.muted}>{state.error}</Text>
      </Card>
    );
  }
  if ("locked" in state && state.locked) {
    const when = state.unlocksAt
      ? `Unlocks ${formatInstant(state.unlocksAt)}`
      : state.lockedSince
        ? `Locked since ${formatInstant(state.lockedSince)}`
        : "Entry info is locked";
    return (
      <Card style={styles.card} testID="entry-info-locked">
        <Text style={styles.title}>🔒 Entry info</Text>
        <Text style={styles.body}>{when}</Text>
        <Text style={styles.muted}>Opens 2 hours before you arrive at the owner's place.</Text>
      </Card>
    );
  }

  const access = state as HomeAccess;
  return (
    <Card style={styles.card} testID="entry-info-open">
      <Text style={styles.title}>🔑 Entry info</Text>
      {!show ? (
        <Button label="Show code" onPress={() => setShow(true)} testID="entry-show-code" />
      ) : (
        <View style={styles.codes} testID="entry-codes">
          {access.entrySteps ? <Text style={styles.body}>{access.entrySteps}</Text> : null}
          {access.lockboxCode ? <Text style={styles.code}>{`Lockbox: ${access.lockboxCode}`}</Text> : null}
          {access.buzzer ? <Text style={styles.code}>{`Buzzer: ${access.buzzer}`}</Text> : null}
          {access.fobNotes ? <Text style={styles.body}>{`Fob: ${access.fobNotes}`}</Text> : null}
          {access.sitterParking ? <Text style={styles.body}>{`Parking: ${access.sitterParking}`}</Text> : null}
          <Text style={styles.muted}>Hides again in a few seconds.</Text>
        </View>
      )}
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.sm },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    body: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },
    code: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    codes: { gap: theme.spacing.xs },
  });
