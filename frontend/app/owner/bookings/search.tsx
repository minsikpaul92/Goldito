import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { CheckRow } from "../../../components/ui/CheckRow";
import { DayPickerSheet } from "../../../components/ui/DayPickerSheet";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { Slider } from "../../../components/ui/Slider";
import { Stepper } from "../../../components/ui/Stepper";
import { TextButton } from "../../../components/ui/TextButton";
import { TimePickerSheet } from "../../../components/ui/TimePickerSheet";
import { SPECIES_EMOJI } from "../../../features/pets/petFormat";
import { useMyPets } from "../../../features/pets/useMyPets";
import { loadRoleProfile, loadSearchRadius, saveSearchRadius } from "../../../features/profile/profileApi";
import { addDays, appToday, formatDay, formatDayRange, formatTime, shiftTime, zonedToIso } from "../../../features/schedule/dates";
import { SERVICE_LABEL, favoritesFirst, listFavoriteSitterIds, ownersSetting } from "../../../features/sitters/sitterApi";
import { BookingError, NearbySitter, searchSittersNearby } from "../../../lib/bookings";
import { LatLng, LocationError, getCurrentPosition } from "../../../lib/location";
import { tripProblem } from "../../../lib/trip";
import { useSession } from "../../../providers/SessionProvider";
import { useThemedStyles } from "../../../providers/ThemeProvider";
import { Theme } from "../../../theme/themes";

/** Any change to the filters re-searches once it rests this long. */
const SEARCH_DELAY_MS = 400;
const MIN_KM = 1;
const MAX_KM = 100;
const START_KM = 5;
const TIME_STEP = 15;

type When = { day: string; time: string };
type Place = "home" | "here";
type Results =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; sitters: NearbySitter[]; radiusKm: number }
  | { status: "error"; code: string; message: string };

const LOCATION_MESSAGE: Record<LocationError["reason"], string> = {
  denied: "Location is blocked for this site. Allow it in the browser's address bar, or search from your home.",
  unavailable: "Couldn't find where you are. Try again, or search from your home.",
  timeout: "Finding your location took too long. Try again, or search from your home.",
  unsupported: "This browser can't share a location. Search from your home instead.",
};

/** The next wider radius the empty state offers. */
function widerRadius(km: number): number | null {
  if (km >= MAX_KM) return null;
  return [25, 50, MAX_KM].find((step) => step > km) ?? MAX_KM;
}

function priceLine(s: NearbySitter): string | null {
  if (s.boardingNightly != null) return `${SERVICE_LABEL.boarding} $${s.boardingNightly} / night`;
  if (s.houseSittingNightly != null) return `${SERVICE_LABEL.house_sitting} $${s.houseSittingNightly} / night`;
  return null;
}

/** Date then time for one handoff: − / + to nudge, tap the value for the calendar or the clock (DESIGN.md §7.10). */
function WhenRow({ title, kind, value, minDay, onChange }: { title: string; kind: string; value: When; minDay: string; onChange: (v: When) => void }) {
  const styles = useThemedStyles(makeStyles);
  const [sheet, setSheet] = useState<"day" | "time" | null>(null);
  return (
    <View style={styles.when} testID={`search-${kind}`}>
      <Text style={styles.label}>{title}</Text>
      <View style={styles.whenRow}>
        <Stepper
          label={`${title} day`}
          value={formatDay(value.day)}
          onDecrease={() => onChange({ ...value, day: addDays(value.day, -1) })}
          onIncrease={() => onChange({ ...value, day: addDays(value.day, 1) })}
          canDecrease={value.day > minDay}
          onPressValue={() => setSheet("day")}
          testID={`search-${kind}-day`}
        />
        <Stepper
          label={`${title} time`}
          value={formatTime(value.time)}
          onDecrease={() => onChange({ ...value, time: shiftTime(value.time, -TIME_STEP) })}
          onIncrease={() => onChange({ ...value, time: shiftTime(value.time, TIME_STEP) })}
          onPressValue={() => setSheet("time")}
          testID={`search-${kind}-time`}
        />
      </View>
      <DayPickerSheet
        visible={sheet === "day"}
        title={`${title} day`}
        value={value.day}
        minDay={minDay}
        onPick={(day) => onChange({ ...value, day })}
        onClose={() => setSheet(null)}
        testID={`search-${kind}-calendar`}
      />
      <TimePickerSheet
        visible={sheet === "time"}
        title={`${title} time`}
        value={value.time}
        onPick={(time) => {
          onChange({ ...value, time });
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
        testID={`search-${kind}-clock`}
      />
    </View>
  );
}

/**
 * Find a sitter: who's staying, drop-off and pick-up, from home or from here, how far. Every change re-searches by
 * itself (search_sitters_nearby, 014c/014i) and the button says how many sitters are free for the whole stay; it
 * opens the results on the next screen, and a result opens the sitter detail.
 */
export default function FindSitter() {
  const styles = useThemedStyles(makeStyles);
  const { profile } = useSession();
  const { status: petStatus, pets } = useMyPets();
  const today = useMemo(() => appToday(), []);

  const [petIds, setPetIds] = useState<string[]>([]);
  const [dropOff, setDropOff] = useState<When>({ day: addDays(today, 1), time: "09:00" });
  const [pickUp, setPickUp] = useState<When>({ day: addDays(today, 3), time: "17:00" });
  const [place, setPlace] = useState<Place>("home");
  // undefined = still loading; null = no home point saved
  const [home, setHome] = useState<LatLng | null | undefined>(undefined);
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  // null = the owner's last radius is still loading
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const savedRadius = useRef<number | null>(null);
  const [results, setResults] = useState<Results>({ status: "idle" });
  const [retry, setRetry] = useState(0);
  const [showing, setShowing] = useState(false);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(new Set());

  // Everyone is staying unless the owner says otherwise.
  useEffect(() => {
    setPetIds((ids) => (ids.length === 0 ? pets.map((p) => p.id) : ids));
  }, [pets]);

  useEffect(() => {
    if (!profile) return;
    loadRoleProfile(profile.id, "owner")
      .then((r) => setHome(r.fields.home_lat != null && r.fields.home_lng != null ? { lat: r.fields.home_lat, lng: r.fields.home_lng } : null))
      .catch(() => setHome(null));
    loadSearchRadius(profile.id)
      .catch(() => null)
      .then((km) => {
        savedRadius.current = km;
        setRadiusKm(km ?? START_KM);
      });
    listFavoriteSitterIds()
      .then((ids) => setFavorites(new Set(ids)))
      .catch(() => undefined);
  }, [profile]);

  // Remember the radius the owner settles on.
  useEffect(() => {
    if (!profile || radiusKm == null || radiusKm === savedRadius.current) return;
    const timer = setTimeout(() => {
      savedRadius.current = radiusKm;
      saveSearchRadius(profile.id, radiusKm).catch(() => undefined);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [profile, radiusKm]);

  const locate = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      setHere(await getCurrentPosition()); // the browser's own permission prompt
    } catch (error) {
      setLocationError(error instanceof LocationError ? LOCATION_MESSAGE[error.reason] : LOCATION_MESSAGE.unavailable);
    } finally {
      setLocating(false);
    }
  };

  const choosePlace = (next: Place) => {
    setPlace(next);
    if (next === "here" && !here && !locating) void locate();
  };

  const dropIso = zonedToIso(dropOff.day, dropOff.time);
  const pickIso = zonedToIso(pickUp.day, pickUp.time);
  const problem = tripProblem(
    petIds,
    { ...dropOff, locationType: "sitter_home", note: "" },
    { ...pickUp, locationType: "sitter_home", note: "" },
  );
  const placeProblem =
    place === "home"
      ? home === null
        ? "Your home isn't on the map yet."
        : null
      : here
        ? null
        : locating
          ? "Finding your location…"
          : (locationError ?? "Allow your location to search from here.");
  const ready = !problem && !placeProblem && home !== undefined && radiusKm != null;
  const point = place === "here" ? here : null;
  const petKey = petIds.join();

  // Runs on every filter change (debounced); stale answers are dropped.
  useEffect(() => {
    if (!ready || radiusKm == null) {
      setResults({ status: "idle" });
      return;
    }
    let current = true;
    setResults({ status: "loading" });
    const timer = setTimeout(() => {
      searchSittersNearby({ dropOffAt: dropIso, pickUpAt: pickIso, petCount: petKey.split(",").length, radiusKm, point })
        .then((sitters) => current && setResults({ status: "ready", sitters, radiusKm }))
        .catch((error: Error) => {
          if (!current) return;
          const code = error instanceof BookingError ? error.code : "";
          if (code === "no_home_point") setHome(null);
          setResults({ status: "error", code, message: error.message });
        });
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // point is read through its coordinates so a new object with the same place does not search again
  }, [ready, dropIso, pickIso, petKey, radiusKm, point?.lat, point?.lng, retry]);

  const openSitter = (s: NearbySitter) => {
    const q = new URLSearchParams({ drop: dropIso, pick: pickIso, pets: petIds.join(",") });
    router.push(`/owner/sitters/${s.sitterId}?${q.toString()}`);
  };

  if (petStatus === "loading" && pets.length === 0) return <LoadingView />;

  if (pets.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="🐶"
          title="Add a pet first"
          message="Tell us about your dog or cat, then find a sitter for them."
          action={{ label: "Add pet", onPress: () => router.push("/owner/pets/new") }}
        />
      </Screen>
    );
  }

  const found = results.status === "ready" ? results.sitters : [];
  const sorted = favoritesFirst(found, favorites, (s) => s.sitterId);
  const wider = radiusKm != null ? widerRadius(radiusKm) : null;

  const resultCard = (s: NearbySitter) => {
    const meta = [`≈ ${s.distanceKm} km away`, priceLine(s)].filter(Boolean).join(" · ");
    const about = [s.serviceArea, s.experienceYears != null ? `${s.experienceYears} yrs experience` : null]
      .filter(Boolean)
      .join(" · ");
    return (
      <Pressable
        key={s.sitterId}
        accessibilityRole="button"
        accessibilityLabel={`${s.displayName}, open profile`}
        onPress={() => openSitter(s)}
        testID={`search-result-${s.displayName}`}
      >
        <Card style={styles.result}>
          <View style={styles.resultHead}>
            <Text style={styles.resultName} numberOfLines={1}>
              {favorites.has(s.sitterId) ? `★ ${s.displayName}` : s.displayName}
            </Text>
            {s.isMySitter ? <Text style={styles.tag}>Your sitter</Text> : null}
          </View>
          <Text style={styles.resultMeta} testID={`search-result-${s.displayName}-meta`}>
            {meta}
          </Text>
          {about ? <Text style={styles.hint}>{about}</Text> : null}
          <Text style={styles.hint}>
            {[s.services.map((x) => SERVICE_LABEL[x]).join(" · "), ownersSetting(s.acceptsMultipleOwners).badge].join(" · ")}
          </Text>
        </Card>
      </Pressable>
    );
  };

  if (showing) {
    return (
      <Screen contentStyle={styles.content}>
        <View style={styles.resultsHead}>
          <TextButton label="Edit search" onPress={() => setShowing(false)} style={styles.left} testID="search-edit" />
          <Text style={styles.subtitle} testID="search-count">
            {`${found.length} ${found.length === 1 ? "sitter" : "sitters"} · ${formatDayRange(dropOff.day, pickUp.day)}`}
          </Text>
        </View>
        <View style={styles.section} testID="search-results">
          {sorted.map(resultCard)}
        </View>
      </Screen>
    );
  }

  const count = results.status === "ready" ? results.sitters.length : 0;
  const buttonLabel =
    results.status === "ready"
      ? count === 0
        ? "No sitters free"
        : `Show ${count} ${count === 1 ? "sitter" : "sitters"}`
      : results.status === "loading"
        ? "Searching…"
        : "Show sitters";

  return (
    <View style={styles.root}>
      <Screen contentStyle={styles.content}>
        <Card style={styles.section}>
          <Text accessibilityRole="header" style={styles.title}>
            Who's staying?
          </Text>
          {pets.map((pet) => (
            <CheckRow
              key={pet.id}
              label={`${SPECIES_EMOJI[pet.species]} ${pet.name}`}
              checked={petIds.includes(pet.id)}
              onChange={(on) => setPetIds((ids) => (on ? [...ids, pet.id] : ids.filter((x) => x !== pet.id)))}
              testID={`search-pet-${pet.name}`}
            />
          ))}
        </Card>

        <Card style={styles.section}>
          <Text accessibilityRole="header" style={styles.title}>
            When
          </Text>
          <WhenRow
            title="Drop-off"
            kind="drop_off"
            value={dropOff}
            minDay={today}
            onChange={(v) => {
              setDropOff(v);
              // Keep the pick-up after the drop-off when the drop-off moves past it.
              if (v.day > pickUp.day) setPickUp((p) => ({ ...p, day: v.day }));
            }}
          />
          <WhenRow title="Pick-up" kind="pick_up" value={pickUp} minDay={dropOff.day} onChange={setPickUp} />
          {problem ? (
            <Text style={styles.error} testID="search-trip-problem">
              {problem}
            </Text>
          ) : null}
        </Card>

        <Card style={styles.section}>
          <Text accessibilityRole="header" style={styles.title}>
            Near
          </Text>
          <SegmentedControl
            options={[
              { value: "home", label: "🏠 My home" },
              { value: "here", label: "📍 Where I am now" },
            ]}
            value={place}
            onChange={choosePlace}
            testID="search-place"
          />
          {place === "home" && home === null ? (
            <View style={styles.inline}>
              <Text style={styles.hint} testID="search-no-home">
                Your home isn't on the map yet. Add your address in Profile, or search from where you are now.
              </Text>
              <TextButton label="Open Profile" onPress={() => router.push("/profile")} style={styles.left} testID="search-open-profile" />
            </View>
          ) : null}
          {place === "here" && locating ? (
            <Text style={styles.hint} testID="search-locating">
              Finding your location…
            </Text>
          ) : null}
          {place === "here" && !locating && !here ? (
            <View style={styles.inline}>
              <Text style={styles.error} testID="search-location-error">
                {locationError ?? "Allow your location to search from here."}
              </Text>
              <TextButton label="Try again" onPress={() => void locate()} style={styles.left} testID="search-locate-again" />
            </View>
          ) : null}

          <View style={styles.radiusHead}>
            <Text style={styles.label}>Within</Text>
            <Text style={styles.radiusValue} testID="radius-value">
              {`${radiusKm ?? START_KM} km`}
            </Text>
          </View>
          <Slider
            value={radiusKm ?? START_KM}
            min={MIN_KM}
            max={MAX_KM}
            onChange={setRadiusKm}
            label="Search radius"
            valueText={`${radiusKm ?? START_KM} km`}
            testID="radius-slider"
          />
        </Card>

        {results.status === "error" ? (
          <View style={styles.inline}>
            <Text accessibilityRole="alert" style={styles.error} testID="search-error">
              {results.message}
            </Text>
            {results.code !== "no_home_point" ? (
              <TextButton label="Try again" onPress={() => setRetry((n) => n + 1)} style={styles.left} testID="search-retry" />
            ) : null}
          </View>
        ) : null}
        {results.status === "ready" && count === 0 && wider ? (
          <TextButton label={`Widen to ${wider} km`} onPress={() => setRadiusKm(wider)} style={styles.left} testID="search-widen" />
        ) : null}
      </Screen>

      <View style={styles.footer}>
        <Button label={buttonLabel} onPress={() => setShowing(true)} disabled={results.status !== "ready" || count === 0} testID="search-submit" />
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.background,
    },
    content: {
      gap: theme.spacing.md,
    },
    section: {
      gap: theme.spacing.sm,
    },
    title: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    subtitle: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.textMuted,
    },
    label: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.text,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
    when: {
      gap: theme.spacing.xs,
    },
    whenRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
    },
    inline: {
      gap: theme.spacing.xs,
    },
    left: {
      alignSelf: "flex-start",
      paddingHorizontal: 0,
    },
    radiusHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginTop: theme.spacing.sm,
    },
    radiusValue: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.primary,
    },
    result: {
      gap: theme.spacing.xs,
    },
    resultHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    resultName: {
      flexShrink: 1,
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.text,
    },
    tag: {
      fontSize: theme.fontSize.caption,
      fontWeight: "600",
      color: theme.color.text,
      backgroundColor: theme.color.accent,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
      borderRadius: theme.radius.sm,
      overflow: "hidden",
    },
    resultMeta: {
      fontSize: theme.fontSize.small,
      fontWeight: "600",
      color: theme.color.text,
    },
    resultsHead: {
      gap: theme.spacing.xs,
    },
    footer: {
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
