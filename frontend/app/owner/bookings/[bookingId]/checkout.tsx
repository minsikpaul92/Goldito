import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ConsentCard } from "../../../../components/ConsentCard";
import { Card } from "../../../../components/ui/Card";
import { CheckRow } from "../../../../components/ui/CheckRow";
import { QuoteCard } from "../../../../components/QuoteCard";
import { Button } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { LoadingView } from "../../../../components/ui/LoadingView";
import { Screen } from "../../../../components/ui/Screen";
import { TextField } from "../../../../components/ui/TextField";
import {
  CONSENT_TEMPLATES,
  DEMO_CONSENT_FOOTER,
  listBookingConsents,
  fetchRequiredConsents,
  signConsent,
  type ConsentKind,
  type BookingConsent,
} from "../../../../features/agreements/agreementsApi";
import { loadRoleProfile } from "../../../../features/profile/profileApi";
import {
  BookingError,
  BookingSummary,
  getBooking,
  needsOwnerHomeAccess,
  ownerHasHomeAccess,
  payBookingDemo,
  quoteBookingFor,
  type PriceQuote,
} from "../../../../lib/bookings";
import { useSession } from "../../../../providers/SessionProvider";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";
import { sectionTitleStyle } from "../../../../components/ui/SectionTitle";

/** Names compare without case or extra spaces: "david  kim" signs for "David Kim". */
const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

type Ready = {
  booking: BookingSummary;
  quote: PriceQuote;
  required: ConsentKind[];
  signed: BookingConsent[];
  /** The stay ends at the owner's door but no entry field is saved yet (ENTRY-1). */
  entryMissing: boolean;
};

/**
 * Owner checkout (03C): quote → consents → name → Pay (demo). No Stripe.
 * On a stay that ends at the owner's door, an "Add entry info" card sits above Pay while the entry form is empty (ENTRY-1).
 */
export default function CheckoutScreen() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const session = useSession();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [ready, setReady] = useState<Ready | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Partial<Record<ConsentKind, boolean>>>({});
  const [signerName, setSignerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vetClinic, setVetClinic] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);
  /** Where each consent card and the name field sit in the scroll content, to jump to the first missing one (#282). */
  const spots = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!bookingId || !session.profile) return;
    try {
      const booking = await getBooking(bookingId);
      if (!booking) {
        setLoadError("Booking not found");
        return;
      }
      if (booking.status !== "confirmed") {
        setLoadError("This booking isn't ready for checkout yet.");
        return;
      }
      if (booking.paidAt) {
        router.replace(`/owner/bookings/${bookingId}`);
        return;
      }
      if (!booking.dropOff || !booking.pickUp) {
        setLoadError("Agree on drop-off and pick-up times first.");
        return;
      }
      const [quote, required, signed, profile, hasEntry] = await Promise.all([
        // Includes the fees the owner accepted on the confirmed chat quote: the total paid is this total.
        quoteBookingFor(booking.id, booking.sitterId),
        fetchRequiredConsents(booking.id),
        listBookingConsents(booking.id),
        loadRoleProfile(session.profile.id, "owner"),
        needsOwnerHomeAccess(booking) ? ownerHasHomeAccess(session.profile.id) : Promise.resolve(true),
      ]);
      setVetClinic(profile.role === "owner" ? profile.fields.vet_clinic_name : null);
      setReady({ booking, quote, required, signed, entryMissing: !hasEntry });
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [bookingId, session.profile]);

  // Also when the owner comes back from the entry form.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const signedKinds = useMemo(
    () => new Set((ready?.signed ?? []).map((s) => s.kind)),
    [ready?.signed],
  );

  const unsigned = (ready?.required ?? []).filter((k) => !signedKinds.has(k));
  const allOn = unsigned.length > 0 && unsigned.every((k) => checks[k]);
  const missing = (ready?.required ?? []).filter((k) => !signedKinds.has(k) && !checks[k]);
  // The signature is the owner's own name, as on their profile (#282): any other text does not sign.
  const profileName = session.profile?.displayName ?? "";
  const nameOk = signerName.trim() !== "" && sameName(signerName, profileName);
  // Why Pay is off, in one short line (#282). Null once everything is done.
  const payBlocked = !ready
    ? null
    : missing.length > 0
      ? `Agree to ${missing.length} more item${missing.length === 1 ? "" : "s"}`
      : !signerName.trim()
        ? "Type your name to sign"
        : !nameOk
          ? "Type your name as on your profile"
          : null;
  const jumpToMissing = () => {
    const key = missing[0] ?? "name";
    const y = spots.current[key];
    if (y != null) scroller.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
  };

  const pay = async () => {
    if (!ready || !session.profile) return;
    setBusy(true);
    setError(null);
    try {
      for (const kind of ready.required) {
        if (signedKinds.has(kind)) continue;
        if (!checks[kind]) throw new Error("Agree to every consent before paying.");
        await signConsent({
          bookingId: ready.booking.id,
          kind,
          signerName,
          vetClinicName: vetClinic,
          receiverName: signerName,
        });
      }
      await payBookingDemo(ready.booking.id);
      toast.show("You're all set");
      router.replace(`/owner/bookings/${ready.booking.id}`);
    } catch (err) {
      if (err instanceof BookingError) setError(err.message);
      else setError((err as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Screen>
        <EmptyState
          emoji="💳"
          title="Can't open checkout"
          message={loadError}
          action={{ label: "Back", onPress: () => router.back() }}
        />
      </Screen>
    );
  }
  if (!ready) return <LoadingView />;

  const { booking, quote, required, signed, entryMissing } = ready;
  const totalLabel = `Pay $${quote.total.toFixed(2)} (demo)`;

  return (
    <View style={styles.root}>
      <Screen ref={scroller} contentStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.heading} testID="checkout-title">
          {`✓ ${booking.sitterName} accepted. Finish booking`}
        </Text>
        <QuoteCard quote={quote} plain testID="checkout-quote" />

        {entryMissing ? (
          <Card style={styles.entryCard} testID="checkout-entry-missing">
            <Text style={styles.entryTitle}>🔑 Add entry info</Text>
            <Text style={styles.entryBody}>
              {`${booking.sitterName} will stand at your door with nothing to open it. Add the lockbox code, buzzer or steps now. They see it 2 hours before arrival.`}
            </Text>
            <Button
              label="Add entry info"
              variant="secondary"
              onPress={() => router.push("/owner/home-access")}
              testID="checkout-entry-add"
            />
          </Card>
        ) : null}

        <View style={styles.consentsHead}>
          {unsigned.length > 0 ? (
            <CheckRow
              label="Select all"
              checked={allOn}
              onChange={(on) => setChecks((c) => ({ ...c, ...Object.fromEntries(unsigned.map((k) => [k, on])) }))}
              disabled={busy}
              testID="checkout-agree-all"
            />
          ) : (
            <View />
          )}
          <Text style={styles.consentsLabel} testID="checkout-consents-count">{`Consents (${required.length - missing.length}/${required.length})`}</Text>
        </View>

        {required.map((kind) => {
          const existing = signed.find((s) => s.kind === kind);
          return (
            <View key={kind} onLayout={(e) => (spots.current[kind] = e.nativeEvent.layout.y)}>
              <ConsentCard
                template={CONSENT_TEMPLATES[kind]}
                checked={Boolean(checks[kind])}
                onCheckedChange={(v) => setChecks((c) => ({ ...c, [kind]: v }))}
                signedAt={existing?.signedAt}
                disabled={busy}
                testID={`consent-${kind}`}
              />
            </View>
          );
        })}

        <View onLayout={(e) => (spots.current.name = e.nativeEvent.layout.y)}>
          <TextField
            label="Type your name to sign"
            value={signerName}
            onChangeText={setSignerName}
            // Typed by the person, never filled in (#236): the name is only a hint.
            placeholder={profileName || undefined}
            autoCapitalize="words"
            autoComplete="off"
            autoCorrect={false}
            testID="checkout-signer"
          />
        </View>
        <Text style={styles.footer}>{DEMO_CONSENT_FOOTER}</Text>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="checkout-error">
            {error}
          </Text>
        ) : null}
      </Screen>

      <View style={styles.footerBar}>
        {payBlocked ? (
          <Text style={styles.blocked} testID="checkout-pay-why">
            {payBlocked}
          </Text>
        ) : (
          <Text style={styles.demoHint}>Demo payment, no card needed</Text>
        )}
        {/* A tap on the grayed-out Pay goes to the first thing still missing (#282). */}
        <Button
          label={totalLabel}
          onPress={payBlocked ? jumpToMissing : () => void pay()}
          dimmed={!!payBlocked}
          disabled={busy}
          testID="checkout-pay"
        />
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1 },
    content: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
    heading: { ...sectionTitleStyle(theme), color: theme.color.success },
    consentsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    consentsLabel: { fontSize: 13, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    footer: { fontSize: theme.fontSize.caption, color: theme.color.textMuted, fontStyle: "italic" },
    footerBar: {
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    demoHint: { fontSize: theme.fontSize.small, color: theme.color.textMuted, textAlign: "center" },
    blocked: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text, textAlign: "center" },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
    entryCard: { gap: theme.spacing.sm, borderColor: theme.color.warning, borderWidth: 1 },
    entryTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    entryBody: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },
  });
