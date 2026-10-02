import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { HandoffDraft, HandoffPicker } from "../../../components/HandoffPicker";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { CheckRow } from "../../../components/ui/CheckRow";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingView } from "../../../components/ui/LoadingView";
import { Screen } from "../../../components/ui/Screen";
import { TextButton } from "../../../components/ui/TextButton";
import { TextField } from "../../../components/ui/TextField";
import { SPECIES_EMOJI } from "../../../features/pets/petFormat";
import { useMyPets } from "../../../features/pets/useMyPets";
import { addDays, appToday, formatTime, zonedToIso } from "../../../features/schedule/dates";
import { MySitter, listMySitters } from "../../../features/sitters/sitterApi";
import { BookingError, SitterMatch, coversWholeTrip, requestBooking, searchSitters } from "../../../lib/bookings";
import { useTheme, useThemedStyles } from "../../../providers/ThemeProvider";
import { useToast } from "../../../providers/ToastProvider";
import { Theme } from "../../../theme/themes";

const MAX_TRIP_DAYS = 31;
const SEARCH_DELAY_MS = 400;

type Search =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; matches: SitterMatch[] }
  | { status: "error"; message: string };

function tripProblem(petIds: string[], dropOff: HandoffDraft, pickUp: HandoffDraft): string | null {
  if (petIds.length === 0) return "Pick at least one pet.";
  const drop = Date.parse(zonedToIso(dropOff.day, dropOff.time));
  const pick = Date.parse(zonedToIso(pickUp.day, pickUp.time));
  if (drop <= Date.now() || pick <= drop) return "Pick a drop-off in the future and a pick-up after it.";
  if (pick - drop > MAX_TRIP_DAYS * 86_400_000) return `A trip can be up to ${MAX_TRIP_DAYS} days.`;
  return null;
}

/** Lines under a sitter option: fit for the whole trip and custom times they need to OK. */
function fitLines(match: SitterMatch | undefined, dropOff: HandoffDraft, pickUp: HandoffDraft, name: string): string {
  if (!match) return "Not open for these dates";
  if (!coversWholeTrip(match)) return "Covers part of your trip";
  const lines = ["Available for your whole trip"];
  if (!match.dropOffWithinHours) {
    lines.push(`Drop-off ${formatTime(dropOff.time)} is outside ${name}'s hours — you can still ask`);
  }
  if (!match.pickUpWithinHours) {
    lines.push(`Pick-up ${formatTime(pickUp.time)} is outside ${name}'s hours — you can still ask`);
  }
  return lines.join("\n");
}

/**
 * Book care (phase-03b 3B.3): pets → drop-off / pick-up time and place → "Your sitters"
 * (whole-trip fit, custom-time hints) → other sitters from search_sitters → request.
 * Partly free sitters sit under "Other options" (splitting a trip is the owner's call).
 * Service type (house sitting) arrives in 3B.10; boarding until then.
 */
export default function BookCare() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const params = useLocalSearchParams<{ sitter?: string }>();
  const { status: petStatus, pets } = useMyPets();
  const today = useMemo(() => appToday(), []);

  const [petIds, setPetIds] = useState<string[]>([]);
  const [dropOff, setDropOff] = useState<HandoffDraft>({
    day: addDays(today, 1),
    time: "09:00",
    locationType: "sitter_home",
    note: "",
  });
  const [pickUp, setPickUp] = useState<HandoffDraft>({
    day: addDays(today, 3),
    time: "17:00",
    locationType: "sitter_home",
    note: "",
  });
  const [mySitters, setMySitters] = useState<MySitter[]>([]);
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const [sitterId, setSitterId] = useState<string | null>(params.sitter ?? null);
  const [showPartial, setShowPartial] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // One pet → picked for you.
  useEffect(() => {
    if (pets.length === 1) setPetIds([pets[0].id]);
  }, [pets]);

  useEffect(() => {
    listMySitters()
      .then(setMySitters)
      .catch(() => setMySitters([]));
  }, []);

  const problem = tripProblem(petIds, dropOff, pickUp);
  const dropIso = zonedToIso(dropOff.day, dropOff.time);
  const pickIso = zonedToIso(pickUp.day, pickUp.time);

  // Re-search after the trip settles (each stepper click would otherwise fire a request).
  useEffect(() => {
    if (problem) {
      setSearch({ status: "idle" });
      return;
    }
    setSearch({ status: "loading" });
    let current = true;
    const timer = setTimeout(() => {
      searchSitters(dropIso, pickIso, petIds.length)
        .then((matches) => current && setSearch({ status: "ready", matches }))
        .catch((error: Error) => current && setSearch({ status: "error", message: error.message }));
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [problem, dropIso, pickIso, petIds.length]);

  const matches = search.status === "ready" ? search.matches : [];
  const matchFor = (id: string) => matches.find((m) => m.sitterId === id);
  const others = matches.filter((m) => !mySitters.some((s) => s.id === m.sitterId));
  const otherWhole = others.filter(coversWholeTrip);
  const otherPartial = others.filter((m) => !coversWholeTrip(m));

  // A pick only counts while that sitter still covers the whole trip.
  const chosen = sitterId ? matchFor(sitterId) : undefined;
  const chosenOk = !!chosen && coversWholeTrip(chosen);
  const sitterName = chosenOk ? chosen.displayName : null;

  const placeProblem =
    (dropOff.locationType === "other" && !dropOff.note.trim()) || (pickUp.locationType === "other" && !pickUp.note.trim())
      ? "Tell the sitter where to meet."
      : null;

  const petLabel = (ids: string[]) => {
    const names = pets.filter((p) => ids.includes(p.id)).map((p) => p.name);
    return names.length === 1 ? names[0] : "One of your pets";
  };

  const send = async () => {
    if (!chosenOk || problem || placeProblem) return;
    setSending(true);
    setSendError(null);
    try {
      await requestBooking({
        sitterId: chosen.sitterId,
        petIds,
        dropOff: { at: dropIso, locationType: dropOff.locationType, note: dropOff.note.trim() || null },
        pickUp: { at: pickIso, locationType: pickUp.locationType, note: pickUp.note.trim() || null },
        note: note.trim() || null,
      });
      toast.show(`Request sent to ${chosen.displayName} 📨`);
      router.replace("/owner/bookings");
    } catch (error) {
      const code = error instanceof BookingError ? error.code : "";
      if (code === "pet_already_booked") {
        setSendError(`${petLabel(petIds)} already has a sitter (or a pending request) at that time.`);
      } else if (code === "sitter_unavailable") {
        setSendError(`${chosen.displayName} no longer has room for these dates. Pick another sitter.`);
        setSitterId(null);
      } else {
        setSendError((error as Error).message);
      }
    } finally {
      setSending(false);
    }
  };

  if (petStatus === "loading" && pets.length === 0) return <LoadingView />;

  if (pets.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="🐶"
          title="Add a pet first"
          message="Tell us about your dog or cat, then book a sitter for them."
          action={{ label: "Add pet", onPress: () => router.push("/owner/pets/new") }}
        />
      </Screen>
    );
  }

  const sitterOption = (id: string, name: string, match: SitterMatch | undefined) => (
    <CheckRow
      key={id}
      radio
      label={name}
      hint={fitLines(match, dropOff, pickUp, name)}
      checked={sitterId === id && !!match && coversWholeTrip(match)}
      disabled={!match || !coversWholeTrip(match)}
      onChange={() => setSitterId(id)}
      testID={`pick-sitter-${name}`}
    />
  );

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
              testID={`pick-pet-${pet.name}`}
            />
          ))}
        </Card>

        <Card style={styles.section}>
          <HandoffPicker
            kind="drop_off"
            value={dropOff}
            minDay={today}
            sitterName={sitterName}
            onChange={(value) => {
              setDropOff(value);
              // Keep the pick-up after the drop-off when the drop-off moves past it.
              if (value.day > pickUp.day) setPickUp((p) => ({ ...p, day: value.day }));
            }}
          />
        </Card>

        <Card style={styles.section}>
          <HandoffPicker kind="pick_up" value={pickUp} minDay={dropOff.day} sitterName={sitterName} onChange={setPickUp} />
        </Card>

        <Card style={styles.section}>
          <Text accessibilityRole="header" style={styles.title}>
            Sitter
          </Text>
          {problem ? (
            <Text style={styles.hint} testID="trip-problem">
              {problem}
            </Text>
          ) : search.status === "loading" ? (
            <ActivityIndicator color={theme.color.primary} accessibilityLabel="Looking for sitters" />
          ) : search.status === "error" ? (
            <Text style={styles.error}>{search.message}</Text>
          ) : (
            <View style={styles.section} accessibilityRole="radiogroup" testID="sitter-options">
              {mySitters.length > 0 ? (
                <>
                  <Text style={styles.subtitle}>Your sitters</Text>
                  {mySitters.map((s) => sitterOption(s.id, s.displayName, matchFor(s.id)))}
                </>
              ) : null}
              {otherWhole.length > 0 ? (
                <>
                  <Text style={styles.subtitle}>{mySitters.length > 0 ? "Other sitters" : "Sitters free for your trip"}</Text>
                  {otherWhole.map((m) => sitterOption(m.sitterId, m.displayName, m))}
                </>
              ) : null}
              {!matches.some(coversWholeTrip) ? (
                <Text style={styles.hint} testID="no-whole-trip">
                  No sitter is free for your whole trip. Try other dates or times.
                </Text>
              ) : null}
              {otherPartial.length > 0 ? (
                <>
                  <TextButton
                    label={showPartial ? "Hide other options" : `Other options (${otherPartial.length})`}
                    onPress={() => setShowPartial((v) => !v)}
                    style={styles.left}
                    testID="toggle-partial"
                  />
                  {showPartial ? otherPartial.map((m) => sitterOption(m.sitterId, m.displayName, m)) : null}
                </>
              ) : null}
            </View>
          )}
        </Card>

        <Card style={styles.section}>
          <TextField
            label="Note for the sitter (optional)"
            placeholder="e.g. Bori gets anxious with loud noises"
            value={note}
            onChangeText={setNote}
            maxLength={500}
            multiline
            testID="booking-note"
          />
        </Card>

        {placeProblem ? <Text style={styles.error}>{placeProblem}</Text> : null}
        {sendError ? (
          <Text accessibilityRole="alert" style={styles.error} testID="booking-error">
            {sendError}
          </Text>
        ) : null}
      </Screen>

      <View style={styles.footer}>
        <Button
          label={sending ? "Sending…" : sitterName ? `Request booking with ${sitterName}` : "Request booking"}
          onPress={() => void send()}
          disabled={sending || !chosenOk || !!problem || !!placeProblem}
          testID="request-booking"
        />
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
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
    left: {
      alignSelf: "flex-start",
      paddingHorizontal: 0,
    },
    footer: {
      padding: theme.spacing.md,
      maxWidth: 480,
      width: "100%",
      alignSelf: "center",
    },
  });
