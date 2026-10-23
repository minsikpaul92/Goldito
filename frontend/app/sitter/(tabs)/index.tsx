import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";

import { ActiveTripCard } from "../../../components/ActiveTripCard";
import { placeLabel } from "../../../components/BookingCard";
import { SitterDashboard } from "../../../components/SitterDashboard";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { caringPetsFromBookings, isCaring } from "../../../features/feed/caringPets";
import { useMyChats } from "../../../features/chat/useMyChats";
import { SPECIES_EMOJI } from "../../../features/pets/petFormat";
import { appToday, formatInstant, formatTime, isoToZoned } from "../../../features/schedule/dates";
import { BookingSummary, HandoffKind, listSitterBookings } from "../../../lib/bookings";
import { PhotoRequest, listOpenPhotoRequestsForSitter } from "../../../lib/photoRequests";
import { useSession } from "../../../providers/SessionProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useNotifications, useOnBookingChange } from "../../../providers/NotificationsProvider";
import { Theme } from "../../../theme/themes";
import { sectionTitleStyle } from "../../../components/ui/SectionTitle";

type State =
  | { status: "loading" }
  | { status: "ready"; bookings: BookingSummary[]; photoRequests: PhotoRequest[] }
  | { status: "error"; message: string };

type Due = { booking: BookingSummary; kind: HandoffKind; at: string };

/** The pet room's share of the visible page, and its height before the page is measured. */
const ROOM_SHARE = 0.7;
const ROOM_FALLBACK = 420;

const pets = (b: BookingSummary) => b.pets.map((p) => `${SPECIES_EMOJI[p.species]} ${p.name}`).join("  ");

/**
 * Sitter Home dashboard (D47b; was Today / 3B.8): **Now caring** when on duty,
 * else **Requests** · **Today** (drop/pick due today) · **Upcoming** by time.
 * Pets in care show as pixel pets with feed / walk / poop / nap taps (11.12).
 */
export default function SitterHome() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const sitterId = profile?.id;
  const [state, setState] = useState<State>({ status: "loading" });
  const chats = useMyChats();
  // The pet room takes most of the first screen, so the pet is the biggest thing on Home without scrolling.
  const [pageHeight, setPageHeight] = useState(0);
  const measure = (e: LayoutChangeEvent) => setPageHeight(e.nativeEvent.layout.height);

  const load = useCallback(async () => {
    if (!sitterId) return;
    try {
      const [bookings, photoRequests] = await Promise.all([
        listSitterBookings(sitterId),
        listOpenPhotoRequestsForSitter(sitterId).catch(() => [] as PhotoRequest[]),
      ]);
      setState({ status: "ready", bookings, photoRequests });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, [sitterId]);

  useOnBookingChange(() => void load());
  // 11.1: a new `photo_request` notice shows its banner without leaving Home.
  const { inboxRevision } = useNotifications();
  useEffect(() => {
    if (inboxRevision > 0) void load();
  }, [inboxRevision, load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (state.status === "loading") return <LoadingView />;
  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState
          emoji="🌤️"
          title="Couldn't load today"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      </Screen>
    );
  }

  const now = Date.now();
  const today = appToday();
  const confirmed = state.bookings.filter((b) => b.status === "confirmed");
  const requests = state.bookings.filter((b) => b.status === "requested").length;
  const questions = chats.unread;
  const caring = confirmed.filter((b) => isCaring(b, now));
  const due: Due[] = confirmed
    .flatMap((b) =>
      (["drop_off", "pick_up"] as HandoffKind[]).flatMap((kind) => {
        const h = kind === "drop_off" ? b.dropOff : b.pickUp;
        return h && !h.completedAt && isoToZoned(h.at).day === today ? [{ booking: b, kind, at: h.at }] : [];
      }),
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  const upcoming = confirmed
    .filter((b) => b.dropOff && !b.dropOff.completedAt && isoToZoned(b.dropOff.at).day > today)
    .sort((a, b) => (a.dropOff?.at ?? "").localeCompare(b.dropOff?.at ?? ""))
    .slice(0, 5);

  if (requests === 0 && questions === 0 && caring.length === 0 && due.length === 0 && upcoming.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="🌤️"
          title="No pets in your care today"
          message="Open your schedule to take bookings."
          action={{ label: "Open your schedule", onPress: () => router.push("/sitter/schedule") }}
        />
      </Screen>
    );
  }

  const open = (b: BookingSummary) => router.push(`/sitter/bookings/${b.id}`);
  const caringPets = caringPetsFromBookings(confirmed, now);

  return (
    <View style={styles.page} onLayout={measure}>
      <Screen contentStyle={styles.content} testID="sitter-home">
        <ActiveTripCard role="sitter" />
        {state.photoRequests.map((r) => {
          const pet = caringPets.find((p) => p.id === r.pet_id);
          if (!pet) return null;
          return (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              onPress={() => router.push(`/sitter/feed/${pet.id}`)}
              style={({ pressed }) => [styles.requests, pressed && styles.pressed]}
              testID="home-photo-request"
            >
              <Text style={styles.requestsText}>{`📷 ${pet.ownerName} asked for a photo of ${pet.name}`}</Text>
            </Pressable>
          );
        })}
        {requests > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/sitter/bookings")}
            style={({ pressed }) => [styles.requests, pressed && styles.pressed]}
            testID="today-requests"
          >
            <Text style={styles.requestsText}>{`📬 Requests (${requests})`}</Text>
          </Pressable>
        ) : null}

        {questions > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/sitter/chat")}
            style={({ pressed }) => [styles.requests, pressed && styles.pressed]}
            testID="today-chats"
          >
            <Text style={styles.requestsText}>{`💬 Chats (${questions})`}</Text>
          </Pressable>
        ) : null}

        {caringPets.length > 0 ? <SitterDashboard pets={caringPets} roomHeight={pageHeight > 0 ? Math.round(pageHeight * ROOM_SHARE) : ROOM_FALLBACK} /> : null}

        {due.length > 0 ? (
          <View style={styles.section} testID="today-due">
            <Text accessibilityRole="header" style={styles.heading}>
              Today
            </Text>
            {due.slice(0, 2).map(({ booking: b, kind, at }) => {
              const h = kind === "drop_off" ? b.dropOff : b.pickUp;
              return (
                <Pressable key={`${b.id}-${kind}`} accessibilityRole="button" onPress={() => open(b)} testID={`handoff-row-${b.id}-${kind}`}>
                  <Card style={styles.card}>
                    <Text style={styles.title}>
                      {`${formatTime(isoToZoned(at).time)} · ${kind === "drop_off" ? "Drop-off" : "Pick-up"}`}
                    </Text>
                    <Text style={styles.body}>{`${pets(b)} · ${b.ownerName}`}</Text>
                    {h ? <Text style={styles.muted}>{placeLabel(h.locationType, h.note, b, "sitter")}</Text> : null}
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {upcoming.length > 0 ? (
          <View style={styles.section} testID="today-upcoming">
            <Text accessibilityRole="header" style={styles.heading}>
              Upcoming
            </Text>
            {upcoming.slice(0, 2).map((b) => (
              <Pressable key={b.id} accessibilityRole="button" onPress={() => open(b)} testID={`request-row-${b.id}`}>
                <Card style={styles.card}>
                  <Text style={styles.title}>{`${b.ownerName} · ${b.dropOff ? formatInstant(b.dropOff.at) : ""}`}</Text>
                  <Text style={styles.body}>{pets(b)}</Text>
                </Card>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Screen>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    page: {
      flex: 1,
    },
    content: {
      gap: theme.spacing.lg,
    },
    section: {
      gap: theme.spacing.sm,
    },
    heading: sectionTitleStyle(theme),
    card: {
      gap: theme.spacing.xs,
    },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    body: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
    },
    muted: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    requests: {
      padding: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.primary,
      backgroundColor: theme.color.accent,
    },
    requestsText: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.primary,
    },
    pressed: {
      opacity: 0.8,
    },
  });
