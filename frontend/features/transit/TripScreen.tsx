import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { EntryInfoCard } from "../../components/EntryInfoCard";
import { OpenInMapsButton } from "../../components/OpenInMapsButton";
import { TripMap } from "../../components/TripMap";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { TextButton } from "../../components/ui/TextButton";
import { BookingSummary, HandoffPlace, HandoffKind, getBooking, getHandoffDetails } from "../../lib/bookings";
import { destination, endTrip, formatDistance, isLive, livePosition } from "../../lib/transit";
import { useOnBookingChange } from "../../providers/NotificationsProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useTrip } from "../../providers/TripProvider";
import { Theme } from "../../theme/themes";
import { formatTime, isoToZoned } from "../schedule/dates";
import { Role, canTravel, nextHandoff, placeFor, startOpensAt } from "./tripLogic";
import { useLiveTrips } from "./useLiveTrips";
import { useStartTrip } from "./useStartTrip";

type State =
  | { status: "loading" }
  | { status: "ready"; booking: BookingSummary; places: Partial<Record<HandoffKind, HandoffPlace>> }
  | { status: "missing" }
  | { status: "error"; message: string };

const clock = (iso: string) => formatTime(isoToZoned(iso).time);

/**
 * The Trip screen, for both people (phase-06b 6B.3 · 6B.4): who is on the way, a map, the ETA, and — once they
 * arrive — the card for the place (the sitter gets the entry info, the owner gets the sitter's place notes).
 */
export function TripScreen({ role }: { role: Role }) {
  const styles = useThemedStyles(makeStyles);
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { profile } = useSession();
  const { sharing, stop } = useTrip();
  const { trips, reload } = useLiveTrips(bookingId);
  const [state, setState] = useState<State>({ status: "loading" });
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!bookingId) return;
    try {
      const booking = await getBooking(bookingId);
      if (!booking) {
        setState({ status: "missing" });
        return;
      }
      const details =
        booking.status === "confirmed" && (booking.paidAt || booking.priceSnapshot)
          ? await getHandoffDetails(booking.id)
          : { places: {}, error: null as string | null };
      setState({ status: "ready", booking, places: details.places });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);
  useOnBookingChange(() => void load());

  const booking = state.status === "ready" ? state.booking : null;
  // Called unconditionally (hooks): a placeholder booking until the real one is loaded.
  const startTrip = useStartTrip(booking ?? PLACEHOLDER, role);

  if (state.status === "loading" || trips === null) return <LoadingView />;
  if (state.status === "missing") {
    return (
      <Screen>
        <EmptyState emoji="📅" title="Booking not found" message="It may have been cancelled or removed." />
      </Screen>
    );
  }
  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState emoji="📬" title="Couldn't load this trip" message={state.message} action={{ label: "Try again", onPress: () => void load() }} />
      </Screen>
    );
  }

  const { booking: b, places } = state;
  const live = trips.find(isLive);
  const me = profile?.id;
  const other = role === "owner" ? b.sitterName : b.ownerName;
  // Back to the booking that is already open underneath (a fresh copy would leave two of them in the stack).
  const openBooking = () => router.dismissTo(`/${role}/bookings/${b.id}`);

  if (!live) {
    const next = nextHandoff(b);
    const mayStart = !!next && !!b.paidAt && canTravel(role, next.handoff.locationType);
    const opens = next ? startOpensAt(next.handoff) : 0;
    return (
      <Screen contentStyle={styles.content} testID="trip-screen">
        <Card style={styles.card} testID="trip-none">
          <Text style={styles.title}>No trip running</Text>
          <Text style={styles.muted}>
            {mayStart && Date.now() < opens
              ? `You can start the trip from ${clock(new Date(opens).toISOString())}.`
              : mayStart
                ? `Start the trip when you head out. ${other} can follow you on a map.`
                : `When ${other} heads out, you can follow them here.`}
          </Text>
          {mayStart && next && Date.now() >= opens ? (
            <Button label="Start trip" onPress={() => void startTrip(next.kind)} testID="trip-start" />
          ) : null}
          {next ? (
            <OpenInMapsButton
              place={placeFor(next.handoff, places[next.kind]?.address, null)}
              travelling={mayStart}
              testID="trip-maps"
            />
          ) : null}
        </Card>
        <Button label="Open booking" variant="secondary" onPress={openBooking} testID="trip-open-booking" />
      </Screen>
    );
  }

  const mine = live.traveler_id === me;
  const travelerName = mine ? "You" : other;
  const arrived = live.status === "arrived";
  const handoff = live.handoff_kind === "drop_off" ? b.dropOff : b.pickUp;
  const here = sharing?.trip.id === live.id;
  const position = livePosition(live);
  const place = destination(live);
  const shared = live.sharing !== false; // a trip started without sharing has no map, no ETA and no arrival check
  const mapsPlace = placeFor(handoff, places[live.handoff_kind]?.address, place);
  const lastSeenMin = shared && !arrived && live.last_at ? Math.floor((Date.now() - Date.parse(live.last_at)) / 60_000) : 0;

  const cancel = async () => {
    setCancelling(true);
    try {
      if (here) await stop(true);
      else await endTrip(live.id, true);
      reload();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Screen contentStyle={styles.content} testID="trip-screen">
      {mine && !arrived && shared ? (
        <Banner
          testID="trip-sharing-banner"
          body={
            here
              ? `📡 Sharing your location with ${other} until you arrive`
              : `This device isn't sharing. ${other} sees your last spot.`
          }
        />
      ) : null}
      {mine && !shared ? (
        <Banner testID="trip-not-sharing-banner" body={`You're not sharing your location. ${other} sees the meeting place.`} />
      ) : null}

      <View style={styles.head} testID="trip-status">
        <Text style={styles.eta} testID="trip-eta">
          {!shared
            ? `${travelerName === "You" ? "You're" : `${travelerName} is`} on the way`
            : arrived
            ? `${travelerName === "You" ? "You've" : `${travelerName} has`} arrived 🚗`
            : live.eta_at
              ? `ETA ${clock(live.eta_at)}${live.distance_m != null ? ` · ${formatDistance(live.distance_m)}` : ""}`
              : position
                ? "On the way"
                : `Waiting for ${mine ? "your" : `${other}'s`} first location…`}
        </Text>
        <Text style={styles.muted} testID="trip-substatus">
          {!shared
            ? mine
              ? "Not sharing a live location"
              : `${other} isn't sharing a live location`
            : arrived
            ? `Arrived at ${live.arrived_at ? clock(live.arrived_at) : "-"}`
            : `${mine ? "You're" : `${other} is`} on the way${live.simulated ? " (simulated drive)" : ""}`}
        </Text>
      </View>

      {lastSeenMin >= 1 ? (
        <Text style={styles.muted} testID="trip-last-seen">
          {`Last location ${lastSeenMin} min ago. Sharing pauses while the browser is in the background.`}
        </Text>
      ) : null}
      {shared && place ? <TripMap traveler={arrived ? place : position} dest={place} travelerLabel={travelerName === "You" ? "You" : other} /> : null}
      {!shared ? <MeetingPlaceCard booking={b} handoffKind={live.handoff_kind} address={places[live.handoff_kind]?.address ?? null} /> : null}
      {shared && !place && handoff?.note ? (
        <Card style={styles.card}>
          <Text style={styles.title}>Meeting place</Text>
          <Text style={styles.body}>{handoff.note}</Text>
        </Card>
      ) : null}

      {arrived && mine && role === "sitter" && handoff?.locationType === "owner_home" ? (
        <EntryInfoCard key={`${live.id}-${live.status}`} bookingId={b.id} visible ownerName={b.ownerName} />
      ) : null}
      {arrived && mine && role === "owner" && handoff?.locationType === "sitter_home" ? (
        <PlaceCard name={b.sitterName} place={places[live.handoff_kind]} />
      ) : null}
      {arrived && !mine ? (
        <Card style={styles.card} testID="trip-arrived-card">
          <Text style={styles.title}>{`${other} has arrived`}</Text>
          <Text style={styles.muted}>Head out and meet them, then check the handoff in the booking.</Text>
        </Card>
      ) : null}

      <OpenInMapsButton place={mapsPlace} travelling={mine} testID="trip-maps" />
      {mine && !arrived ? (
        <TextButton label={cancelling ? "Cancelling…" : "Cancel trip"} danger onPress={() => void cancel()} disabled={cancelling} testID="trip-cancel" />
      ) : null}
      <Button label="Open booking" variant="secondary" onPress={openBooking} testID="trip-open-booking" />
    </Screen>
  );
}

/** The meeting place when nobody shares a live position: who it belongs to and the address the person can already see. */
function MeetingPlaceCard({ booking, handoffKind, address }: { booking: BookingSummary; handoffKind: HandoffKind; address: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const handoff = handoffKind === "drop_off" ? booking.dropOff : booking.pickUp;
  const owner = handoff?.locationType === "sitter_home" ? `${booking.sitterName}'s place` : handoff?.locationType === "owner_home" ? `${booking.ownerName}'s place` : "Meeting place";
  const text = address ?? (handoff?.locationType === "other" ? handoff.note : null);
  return (
    <Card style={styles.card} testID="trip-meeting-place">
      <Text style={styles.title}>{`📍 ${owner}`}</Text>
      {text ? <Text style={styles.body}>{text}</Text> : <Text style={styles.muted}>The address is in the booking.</Text>}
    </Card>
  );
}

/** The sitter's place, for the owner who just arrived (visitor parking and lobby notes come after payment, D31). */
function PlaceCard({ name, place }: { name: string; place: HandoffPlace | undefined }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Card style={styles.card} testID="trip-place-card">
      <Text style={styles.title}>{`📍 ${name}'s place`}</Text>
      {place?.address ? <Text style={styles.body}>{place.address}</Text> : <Text style={styles.muted}>The address is in your booking.</Text>}
      {place?.visitorParking ? <Text style={styles.body}>{`Visitor parking: ${place.visitorParking}`}</Text> : null}
      {place?.lobbyNotes ? <Text style={styles.body}>{`Lobby: ${place.lobbyNotes}`}</Text> : null}
    </Card>
  );
}

const PLACEHOLDER = { id: "", ownerName: "", sitterName: "" } as BookingSummary;

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { gap: theme.spacing.md },
    card: { gap: theme.spacing.sm },
    head: { gap: theme.spacing.xs },
    eta: { fontSize: theme.fontSize.title, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    body: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
