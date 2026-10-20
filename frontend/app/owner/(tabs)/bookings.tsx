import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BookingCard } from "../../../components/BookingCard";
import { ChatList } from "../../../components/ChatList";
import { PhotoViewerSheet } from "../../../components/PhotoViewerSheet";
import { SitterSearchBar } from "../../../components/SitterSearchBar";
import { Avatar } from "../../../components/ui/Avatar";
import { Card } from "../../../components/ui/Card";
import { TextButton } from "../../../components/ui/TextButton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { OwnerInquiryCard, listOwnerInquiries } from "../../../features/inquiries/inquiryApi";
import { useMyChats } from "../../../features/chat/useMyChats";
import { ProfilePhoto, loadCoverPhotos, loadProfilePhotos, photoThumb } from "../../../features/profile/profilePhotosApi";
import { formatDay, isoToZoned } from "../../../features/schedule/dates";
import { SERVICE_LABEL } from "../../../features/sitters/sitterApi";
import { useSitterSearch } from "../../../features/sitters/useSitterSearch";
import { NearbySitter, OwnerBooking, listOwnerBookings } from "../../../lib/bookings";
import { useSession } from "../../../providers/SessionProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useOnBookingChange } from "../../../providers/NotificationsProvider";
import { Theme } from "../../../theme/themes";

type State =
  | { status: "loading" }
  | {
      status: "ready";
      bookings: OwnerBooking[];
      inquiries: OwnerInquiryCard[];
    }
  | { status: "error"; message: string };

/**
 * Owner Bookings tab: a hotel-style search line on top (place, dates, pets), the favorite sitters free for those
 * dates (everyone nearby after Search) as photo and name, a tap opens the sitter, then my bookings with status
 * badges (3B.3) and questions.
 */
export default function OwnerBookings() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const ownerId = profile?.id;
  const [state, setState] = useState<State>({ status: "loading" });
  const search = useSitterSearch();
  const chats = useMyChats();
  const [viewer, setViewer] = useState<{ name: string; photos: ProfilePhoto[] } | null>(null);
  // Favorites until the owner presses Search, then everyone nearby.
  const [searched, setSearched] = useState(false);
  const [covers, setCovers] = useState<Map<string, ProfilePhoto>>(new Map());

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      const [bookings, inquiries] = await Promise.all([
        listOwnerBookings(ownerId),
        listOwnerInquiries().catch(() => [] as OwnerInquiryCard[]),
      ]);
      setState({ status: "ready", bookings, inquiries });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, [ownerId]);

  useOnBookingChange(() => void load());

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const found: NearbySitter[] = search.results.status === "ready" ? search.results.sitters : [];
  // Favorites first; with none yet (or after Search) everyone nearby.
  const everyone = searched || search.favorites.size === 0;
  const shown = everyone ? found : found.filter((x) => search.favorites.has(x.sitterId));
  const shownKey = shown.map((x) => x.sitterId).join();
  useEffect(() => {
    let current = true;
    loadCoverPhotos(shownKey ? shownKey.split(",") : []).then((m) => current && setCovers(m));
    return () => {
      current = false;
    };
  }, [shownKey]);

  // The avatar opens the sitter's photos (the profile when there are none); the name opens the sitter.
  const viewPhotos = async (id: string, name: string) => {
    const found = await loadProfilePhotos(id).catch(() => [] as ProfilePhoto[]);
    if (found.length === 0) openSitter(id);
    else setViewer({ name, photos: found });
  };

  const openSitter = (id: string) => {
    const q = new URLSearchParams({ drop: search.dropIso, pick: search.pickIso, pets: search.petIds.join(",") });
    router.push(`/owner/sitters/${id}?${q.toString()}`);
  };

  if (state.status === "loading") return <LoadingView />;

  if (state.status === "error") {
    return (
      <Screen>
        <EmptyState
          emoji="📅"
          title="Couldn't load your bookings"
          message={state.message}
          action={{ label: "Try again", onPress: () => void load() }}
        />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.list}>
        <SitterSearchBar search={search} onSearch={() => setSearched(true)} />
        <View style={styles.section} testID="sitter-results">
          <Text accessibilityRole="header" style={styles.heading}>
            {everyone ? "Sitters nearby" : "Favorites"}
          </Text>
          {search.problem || search.placeProblem ? (
            <View style={styles.section}>
              <Text style={styles.hint} testID="search-problem">
                {search.problem ?? search.placeProblem}
              </Text>
              {search.placeProblem ? (
                <TextButton label="Open Profile" onPress={() => router.push("/profile")} style={styles.left} testID="search-open-profile" />
              ) : null}
            </View>
          ) : search.results.status === "error" ? (
            <View style={styles.section}>
              <Text accessibilityRole="alert" style={styles.hint} testID="search-error">
                {search.results.message}
              </Text>
              <TextButton label="Try again" onPress={search.retry} style={styles.left} testID="search-retry" />
            </View>
          ) : search.results.status !== "ready" ? (
            <Text style={styles.hint}>Looking…</Text>
          ) : shown.length === 0 ? (
            <Text style={styles.hint} testID="search-none">
              {everyone ? `No sitters within ${search.radiusKm} km for these dates.` : "No favorites free for these dates."}
            </Text>
          ) : (
            <View style={styles.rows}>
              {shown.map((sitter) => {
                const cover = covers.get(sitter.sitterId);
                return (
                  <View key={sitter.sitterId} style={styles.row}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${sitter.displayName}'s photos`}
                      onPress={() => void viewPhotos(sitter.sitterId, sitter.displayName)}
                      testID={`sitter-avatar-${sitter.displayName}`}
                    >
                      {cover ? (
                        <Avatar kind="photo" uri={photoThumb(cover, 120)} size={48} />
                      ) : (
                        <Avatar kind="initial" name={sitter.displayName} size={48} />
                      )}
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${sitter.displayName}, ${sitter.distanceKm} km away`}
                      onPress={() => openSitter(sitter.sitterId)}
                      style={styles.rowMain}
                      testID={`sitter-tile-${sitter.displayName}`}
                    >
                      <Text style={styles.rowName} numberOfLines={1}>
                        {search.favorites.has(sitter.sitterId) ? `★ ${sitter.displayName}` : sitter.displayName}
                      </Text>
                      <Text style={styles.rowKm} testID={`sitter-km-${sitter.displayName}`}>{`${sitter.distanceKm} km`}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>
        <PhotoViewerSheet visible={viewer !== null} title={viewer?.name ?? ""} photos={viewer?.photos ?? []} onClose={() => setViewer(null)} testID="sitter-photos" />
        {chats.items.length > 0 ? (
          <View style={styles.section} testID="owner-chats">
            <Text accessibilityRole="header" style={styles.heading}>
              Chats
            </Text>
            <ChatList items={chats.items} onLeave={(id) => void chats.leave(id)} />
          </View>
        ) : null}
        {state.bookings.length === 0 && state.inquiries.length === 0 ? <Text style={styles.hint}>No bookings yet</Text> : null}
        {state.bookings.length > 0 ? (
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>
              Your bookings
            </Text>
            {state.bookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                viewer="owner"
                onPress={() => router.push(`/owner/bookings/${booking.id}`)}
              />
            ))}
          </View>
        ) : null}
        {state.inquiries.length > 0 ? (
          <View style={styles.section} testID="owner-questions">
            <Text accessibilityRole="header" style={styles.heading}>
              Your questions
            </Text>
            {state.inquiries.map((inq) => (
              <Pressable
                key={inq.id}
                accessibilityRole="button"
                onPress={() => router.push(`/owner/inquiries/${inq.id}`)}
                testID={`question-card-${inq.id}`}
              >
                <Card style={styles.question}>
                  <Text style={styles.questionTitle}>{`${inq.sitterName} · ${inq.petNames.join(", ")}`}</Text>
                  <Text style={styles.hint}>
                    {`${SERVICE_LABEL[inq.serviceType].replace(/^\S+\s/, "")} · ${formatDay(isoToZoned(inq.dropOffAt).day)} – ${formatDay(isoToZoned(inq.pickUpAt).day)}`}
                  </Text>
                  <Text style={inq.state === "replied" && inq.status === "open" ? styles.ready : styles.hint}>
                    {inq.status === "booked"
                      ? "Booking requested"
                      : inq.state === "replied"
                        ? "💬 Reply ready"
                        : `Waiting for ${inq.sitterName}`}
                  </Text>
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
    root: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    list: {
      gap: theme.spacing.lg,
    },
    section: {
      gap: theme.spacing.sm,
    },
    heading: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    question: { gap: theme.spacing.xs },
    questionTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    ready: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primary },
    left: { alignSelf: "flex-start", paddingHorizontal: 0 },
    rows: { gap: theme.spacing.xs },
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, paddingVertical: theme.spacing.xs },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
    rowName: { flex: 1, fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    rowKm: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
