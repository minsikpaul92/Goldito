import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ConsentCard } from "../../../../components/ConsentCard";
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
  payBookingDemo,
  quoteBooking,
  type PriceQuote,
} from "../../../../lib/bookings";
import { useSession } from "../../../../providers/SessionProvider";
import { useThemedStyles } from "../../../../providers/ThemeProvider";
import { useToast } from "../../../../providers/ToastProvider";
import { Theme } from "../../../../theme/themes";

type Ready = {
  booking: BookingSummary;
  quote: PriceQuote;
  required: ConsentKind[];
  signed: BookingConsent[];
};

/**
 * Owner checkout (03C): quote → consents → name → Pay (demo). No Stripe.
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
      const [quote, required, signed, profile] = await Promise.all([
        quoteBooking({
          sitterId: booking.sitterId,
          serviceType: booking.serviceType,
          dropOffAt: booking.dropOff.at,
          pickUpAt: booking.pickUp.at,
          petCount: Math.max(booking.pets.length, 1),
        }),
        fetchRequiredConsents(booking.id),
        listBookingConsents(booking.id),
        loadRoleProfile(session.profile.id, "owner"),
      ]);
      setVetClinic(profile.role === "owner" ? profile.fields.vet_clinic_name : null);
      setSignerName(session.profile.displayName);
      setReady({ booking, quote, required, signed });
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [bookingId, session.profile]);

  useEffect(() => {
    void load();
  }, [load]);

  const signedKinds = useMemo(
    () => new Set((ready?.signed ?? []).map((s) => s.kind)),
    [ready?.signed],
  );

  const allChecked =
    ready != null &&
    ready.required.every((k) => signedKinds.has(k) || checks[k]);

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
      toast.show("You're all set ✅");
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

  const { booking, quote, required, signed } = ready;
  const totalLabel = `Pay $${quote.total.toFixed(2)} (demo)`;

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.heading} testID="checkout-title">
          {`Finish booking with ${booking.sitterName}`}
        </Text>
        <QuoteCard quote={quote} testID="checkout-quote" />

        {required.map((kind) => {
          const existing = signed.find((s) => s.kind === kind);
          return (
            <ConsentCard
              key={kind}
              template={CONSENT_TEMPLATES[kind]}
              checked={Boolean(checks[kind])}
              onCheckedChange={(v) => setChecks((c) => ({ ...c, [kind]: v }))}
              signedAt={existing?.signedAt}
              disabled={busy}
              testID={`consent-${kind}`}
            />
          );
        })}

        <TextField
          label="Type your name to sign"
          value={signerName}
          onChangeText={setSignerName}
          autoCapitalize="words"
          testID="checkout-signer"
        />
        <Text style={styles.footer}>{DEMO_CONSENT_FOOTER}</Text>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error} testID="checkout-error">
            {error}
          </Text>
        ) : null}
      </Screen>

      <View style={styles.footerBar}>
        <Text style={styles.demoHint}>Demo payment — no card needed</Text>
        <Button
          label={totalLabel}
          onPress={() => void pay()}
          disabled={busy || !allChecked || !signerName.trim()}
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
    heading: { fontSize: theme.fontSize.title, fontWeight: "700", color: theme.color.text },
    footer: { fontSize: theme.fontSize.caption, color: theme.color.textMuted, fontStyle: "italic" },
    footerBar: {
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    demoHint: { fontSize: theme.fontSize.small, color: theme.color.textMuted, textAlign: "center" },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
  });
