import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { BookingCard } from "../../../components/BookingCard";
import { BookingTicket } from "../../../components/BookingTicket";
import { PhotoViewerSheet } from "../../../components/PhotoViewerSheet";
import { SitterResultCard } from "../../../components/SitterResultCard";
import { SitterSearchBar } from "../../../components/SitterSearchBar";
import { Button } from "../../../components/ui/Button";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { TextButton } from "../../../components/ui/TextButton";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { getRatingSummary } from "../../../features/completion/completionApi";
import { ProfilePhoto, loadCoverPhotos, loadProfilePhotos, photoThumb } from "../../../features/profile/profilePhotosApi";
import { useSitterSearch } from "../../../features/sitters/useSitterSearch";
import { NearbySitter, OwnerBooking, OwnerBucket, listOwnerBookings, needsOwner, ownerBucket } from "../../../lib/bookings";
import { useSession } from "../../../providers/SessionProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { useOnBookingChange } from "../../../providers/NotificationsProvider";
import { Theme } from "../../../theme/themes";
import { tokens } from "../../../theme/tokens";
import { sectionTitleStyle } from "../../../components/ui/SectionTitle";

type State =
  | { status: "loading" }
  | {
      status: "ready";
      bookings: OwnerBooking[];
    }
  | { status: "error"; message: string };

/**
 * Owner Bookings tab (Figma 1730:103907). While a booking is under way, Your bookings come first (Upcoming · Requests ·
 * Past, each stay a ticket) and **Book care** takes you down to the search. With nothing under way the bookings are
 * hidden and the search leads: a hotel-style line (place, dates, pets), the favorite sitters free for those dates, and
 * everyone nearby (3B.3). Past stays are one tap away either way.
 */
export default function OwnerBookings() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const ownerId = profile?.id;
  const [state, setState] = useState<State>({ status: "loading" });
  const search = useSitterSearch();
  const [viewer, setViewer] = useState<{ name: string; photos: ProfilePhoto[] } | null>(null);
  const [covers, setCovers] = useState<Map<string, ProfilePhoto>>(new Map());
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [chip, setChip] = useState<OwnerBucket | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const searchY = useRef(0);

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
    // The stars next to a name: only a sitter with reviews gets one.
    const ids = shownKey ? shownKey.split(",") : [];
    Promise.all(ids.map(async (id) => [id, await getRatingSummary(id)] as const)).then((all) => {
      if (!current) return;
      setRatings(new Map(all.filter(([, r]) => r.count > 0 && r.avg != null).map(([id, r]) => [id, r.avg as number])));
    });
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
    const years = sitter.experienceYears ? `${sitter.experienceYears} yrs exp` : null;
    return (
      <SitterResultCard
        key={sitter.sitterId}
        name={sitter.displayName}
        photo={cover ? photoThumb(cover, 156) : null}
        meta={years}
        km={`${sitter.distanceKm} km`}
        nightly={sitter.boardingNightly ?? sitter.houseSittingNightly}
        favorite={search.favorites.has(sitter.sitterId)}
        rating={ratings.get(sitter.sitterId) ?? null}
        onOpen={() => openSitter(sitter.sitterId)}
        onPhoto={() => void viewPhotos(sitter.sitterId, sitter.displayName)}
        testID={`sitter-tile-${sitter.displayName}`}
      />
    );
  };

  const bookings = state.bookings;
  const inBucket = (k: OwnerBucket) => bookings.filter((x) => ownerBucket(x) === k);
  const active = inBucket("upcoming").length + inBucket("requests").length;
  const past = inBucket("past");
  // The chip open: the one picked, else Upcoming, else Requests; one with something to answer comes first.
  const turn = bookings.find((x) => needsOwner(x));
  const open: OwnerBucket = chip ?? (turn ? ownerBucket(turn) : inBucket("upcoming").length > 0 ? "upcoming" : "requests");
  const listed = inBucket(open);
  const todo = (k: OwnerBucket) => inBucket(k).filter(needsOwner).length;

  const yours = (
    <View style={styles.section} testID="your-bookings">
      <Text accessibilityRole="header" style={styles.heading}>
        Your bookings
      </Text>
      <SegmentedControl
        options={[
          { value: "upcoming", label: "Upcoming", count: todo("upcoming") },
          { value: "requests", label: "Requests", count: todo("requests") },
          { value: "past", label: "Past" },
        ]}
        value={open}
        onChange={setChip}
        scrollable
        testID="owner-bookings-tabs"
      />
      {listed.length === 0 ? (
        <Text style={styles.hint}>{open === "past" ? "No past stays." : open === "upcoming" ? "Nothing paid and coming up." : "Nothing waiting."}</Text>
      ) : (
        <View style={styles.rows}>
          {listed.map((booking) =>
            open === "past" ? (
              <BookingCard key={booking.id} booking={booking} viewer="owner" onPress={() => router.push(`/owner/bookings/${booking.id}`)} />
            ) : (
              <BookingTicket key={booking.id} booking={booking} viewer="owner" onPress={() => router.push(`/owner/bookings/${booking.id}`)} />
            ),
          )}
        </View>
      )}
      <Button label="Book care" onPress={() => scroller.current?.scrollTo({ y: searchY.current, animated: true })} style={styles.bookCare} testID="book-care" />
    </View>
  );

  const search_ = (
    <View style={styles.section} onLayout={(e) => (searchY.current = e.nativeEvent.layout.y)} testID="find-sitter">
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
    </View>
  );

  return (
    <View style={styles.root}>
      <Screen ref={scroller} contentStyle={styles.list}>
        {active > 0 ? yours : null}
        {search_}
        <PhotoViewerSheet visible={viewer !== null} title={viewer?.name ?? ""} photos={viewer?.photos ?? []} onClose={() => setViewer(null)} testID="sitter-photos" />
        {/* Nothing under way: the bookings stay out of the way; the old ones are one tap down here. */}
        {active === 0 && past.length > 0 ? (
          <View style={styles.section} testID="past-bookings">
            <TextButton label={pastOpen ? "Hide past bookings" : `Past bookings (${past.length})`} onPress={() => setPastOpen((v) => !v)} style={styles.left} testID="past-toggle" />
            {pastOpen ? (
              <View style={styles.rows}>
                {past.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} viewer="owner" onPress={() => router.push(`/owner/bookings/${booking.id}`)} />
                ))}
              </View>
            ) : null}
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
    bookCare: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
    rows: { gap: theme.spacing.xs },
    row: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, paddingVertical: theme.spacing.xs },
    rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: theme.spacing.md },
    rowName: { flex: 1, fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    rowKm: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
