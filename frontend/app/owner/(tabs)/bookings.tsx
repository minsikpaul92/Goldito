import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BookingCard } from "../../../components/BookingCard";
import { ChatList } from "../../../components/ChatList";
import { PhotoViewerSheet } from "../../../components/PhotoViewerSheet";
import { SitterResultCard } from "../../../components/SitterResultCard";
import { SitterSearchBar } from "../../../components/SitterSearchBar";
import { Avatar } from "../../../components/ui/Avatar";
import { TextButton } from "../../../components/ui/TextButton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { useMyChats } from "../../../features/chat/useMyChats";
import { ProfilePhoto, loadCoverPhotos, loadProfilePhotos, photoThumb } from "../../../features/profile/profilePhotosApi";
import { useSitterSearch } from "../../../features/sitters/useSitterSearch";
import { NearbySitter, OwnerBooking, listOwnerBookings } from "../../../lib/bookings";
import { useSession } from "../../../providers/SessionProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useOnBookingChange } from "../../../providers/NotificationsProvider";
import { Theme } from "../../../theme/themes";
import { sectionTitleStyle } from "../../../components/ui/SectionTitle";

type State =
  | { status: "loading" }
  | {
      status: "ready";
      bookings: OwnerBooking[];
    }
  | { status: "error"; message: string };

/**
 * Owner Bookings tab: a hotel-style search line on top (place, dates, pets), the favorite sitters free for those
 * dates (everyone nearby after Search) as photo and name, a tap opens the sitter, then my bookings with status
 * badges (3B.3).
 */
export default function OwnerBookings() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const ownerId = profile?.id;
  const [state, setState] = useState<State>({ status: "loading" });
  const search = useSitterSearch();
  const chats = useMyChats();
  const [viewer, setViewer] = useState<{ name: string; photos: ProfilePhoto[] } | null>(null);
  const [covers, setCovers] = useState<Map<string, ProfilePhoto>>(new Map());

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      setState({ status: "ready", bookings: await listOwnerBookings(ownerId) });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, [ownerId]);

  useOnBookingChange(() => void load());

  const { refreshFavorites } = search;
  useFocusEffect(
    useCallback(() => {
      void load();
      // A heart toggled on a sitter's page shows here at once (#267).
      refreshFavorites();
    }, [load, refreshFavorites]),
  );

  const found: NearbySitter[] = search.results.status === "ready" ? search.results.sitters : [];
  // Favorites on top, everyone else free for the stay under "Sitters nearby".
  const favoriteRows = found.filter((x) => search.favorites.has(x.sitterId));
  const otherRows = found.filter((x) => !search.favorites.has(x.sitterId));
  const shown = [...favoriteRows, ...otherRows];
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

  const sitterRow = (sitter: NearbySitter) => {
    const cover = covers.get(sitter.sitterId);
    const years = sitter.experienceYears ? `${sitter.experienceYears} yrs experience` : null;
    return (
      <SitterResultCard
        key={sitter.sitterId}
        name={sitter.displayName}
        photo={cover ? photoThumb(cover, 156) : null}
        meta={years}
        km={`${sitter.distanceKm} km`}
        nightly={sitter.boardingNightly ?? sitter.houseSittingNightly}
        favorite={search.favorites.has(sitter.sitterId)}
        onOpen={() => openSitter(sitter.sitterId)}
        onPhoto={() => void viewPhotos(sitter.sitterId, sitter.displayName)}
        testID={`sitter-tile-${sitter.displayName}`}
      />
    );
  };

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.list}>
        <SitterSearchBar search={search} />
        <View style={styles.section} testID="sitter-results">
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
          ) : (
            <>
              {favoriteRows.length > 0 ? (
                <View style={styles.section} testID="sitter-favorites">
                  <Text accessibilityRole="header" style={styles.heading}>
                    Favorites
                  </Text>
                  <View style={styles.rows}>{favoriteRows.map(sitterRow)}</View>
                </View>
              ) : null}
              <View style={styles.section} testID="sitter-nearby">
                <Text accessibilityRole="header" style={styles.heading}>
                  Sitters nearby
                </Text>
                {otherRows.length === 0 ? (
                  <Text style={styles.hint} testID="search-none">
                    {`No ${favoriteRows.length > 0 ? "other " : ""}sitters within ${search.radiusKm} km for these dates.`}
                  </Text>
                ) : (
                  <View style={styles.rows}>{otherRows.map(sitterRow)}</View>
                )}
              </View>
            </>
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
        {state.bookings.length === 0 ? (
          <EmptyState emoji="🗓️" title="No bookings yet" message="Your stays show up here once a sitter says yes." />
        ) : null}
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
    heading: sectionTitleStyle(theme),
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    left: { alignSelf: "flex-start", paddingHorizontal: 0 },
    rows: { gap: theme.spacing.xs },
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, paddingVertical: theme.spacing.xs },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
    rowName: { flex: 1, fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    rowKm: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
