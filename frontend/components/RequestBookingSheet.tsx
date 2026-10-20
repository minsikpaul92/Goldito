import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "./ui/Button";
import { CheckRow } from "./ui/CheckRow";
import { DayPickerSheet } from "./ui/DayPickerSheet";
import { NoteToggle } from "./ui/NoteToggle";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Sheet } from "./ui/Sheet";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";
import { TimePickerSheet } from "./ui/TimePickerSheet";
import { ChatPet, postBookingRequestCard } from "../features/chat/chatApi";
import { SPECIES_EMOJI } from "../features/pets/petFormat";
import { useMyPets } from "../features/pets/useMyPets";
import { addDays, appToday, formatDay, formatTime, isoToZoned, zonedToIso } from "../features/schedule/dates";
import { ServiceType, getSitterProfile } from "../features/sitters/sitterApi";
import { BookingError, LocationType, requestBooking } from "../lib/bookings";
import { tripProblem } from "../lib/trip";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

type Props = {
  visible: boolean;
  onClose: () => void;
  threadId: string;
  sitterId: string;
  sitterName: string;
  /** The stay on the chat's latest card: dates, times and pets are already chosen. */
  stay: { dropOffAt: string; pickUpAt: string; pets: ChatPet[] } | null;
  onSent: () => void;
};

type Kind = "drop" | "pick";
type When = { day: string; time: string };
type Place = { type: LocationType; note: string };
type Picker = { kind: Kind; part: "day" | "time" } | null;

/**
 * Request booking as a sheet over the chat (3D.7 groundwork): the stay from the search (pets, dates, times), the place of
 * each handoff (the sitter's place unless changed here), an optional note. One send puts the request to the sitter and
 * a card with everything into the chat. How the pets travel was settled in the profiles; only the place can change.
 */
export function RequestBookingSheet({ visible, onClose, threadId, sitterId, sitterName, stay, onSent }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const { pets } = useMyPets();
  const today = appToday();

  const [petIds, setPetIds] = useState<string[]>([]);
  const [dropOff, setDropOff] = useState<When>({ day: addDays(today, 1), time: "09:00" });
  const [pickUp, setPickUp] = useState<When>({ day: addDays(today, 3), time: "17:00" });
  const [places, setPlaces] = useState<Record<Kind, Place>>({ drop: { type: "sitter_home", note: "" }, pick: { type: "sitter_home", note: "" } });
  const [changing, setChanging] = useState<Record<Kind, boolean>>({ drop: false, pick: false });
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [service, setService] = useState<ServiceType>("boarding");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every time the sheet opens it starts from the chat's stay.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setNote("");
    setNoteOpen(false);
    setChanging({ drop: false, pick: false });
    setPlaces({ drop: { type: "sitter_home", note: "" }, pick: { type: "sitter_home", note: "" } });
    if (stay) {
      setPetIds(stay.pets.map((p) => p.id));
      setDropOff(isoToZoned(stay.dropOffAt));
      setPickUp(isoToZoned(stay.pickUpAt));
    } else {
      setPetIds(pets.map((p) => p.id));
      setDropOff({ day: addDays(today, 1), time: "09:00" });
      setPickUp({ day: addDays(today, 3), time: "17:00" });
    }
    // pets is read once when the sheet opens
  }, [visible, stay?.dropOffAt, stay?.pickUpAt]);

  useEffect(() => {
    if (!visible) return;
    getSitterProfile(sitterId)
      .then((s) => setService(s?.services.includes("boarding") || !s ? "boarding" : "house_sitting"))
      .catch(() => undefined);
  }, [visible, sitterId]);

  const houseSitting = service === "house_sitting";
  const draft = (w: When, p: Place) => ({ ...w, locationType: houseSitting ? ("owner_home" as const) : p.type, note: p.note });
  const problem =
    tripProblem(petIds, draft(dropOff, places.drop), draft(pickUp, places.pick)) ??
    (!houseSitting && ((places.drop.type === "other" && !places.drop.note.trim()) || (places.pick.type === "other" && !places.pick.note.trim()))
      ? "Say where you will meet."
      : null);

  const shownPets = stay ? stay.pets.map((p) => ({ ...p, species: pets.find((x) => x.id === p.id)?.species })) : [];

  const setWhen = (kind: Kind, change: Partial<When>) => {
    if (kind === "drop") {
      const next = { ...dropOff, ...change };
      setDropOff(next);
      if (next.day > pickUp.day) setPickUp({ ...pickUp, day: next.day });
    } else setPickUp({ ...pickUp, ...change });
  };

  const placeText = (kind: Kind): string => {
    if (houseSitting) return "At my place";
    const p = places[kind];
    return p.type === "sitter_home" ? `At ${sitterName}'s place` : p.type === "owner_home" ? "At my place" : `Somewhere else${p.note ? `: ${p.note}` : ""}`;
  };

  const send = async () => {
    if (problem || sending) return;
    setSending(true);
    setError(null);
    const place = (w: When, p: Place) => ({ at: zonedToIso(w.day, w.time), locationType: houseSitting ? ("owner_home" as const) : p.type, note: houseSitting ? null : p.note.trim() || null });
    try {
      const bookingId = await requestBooking({
        sitterId,
        petIds,
        dropOff: place(dropOff, places.drop),
        pickUp: place(pickUp, places.pick),
        note: note.trim() || null,
        serviceType: service,
      });
      await postBookingRequestCard(threadId, bookingId).catch(() => undefined);
      toast.show(`Request sent to ${sitterName} 📨`);
      onSent();
      onClose();
    } catch (e) {
      const code = e instanceof BookingError ? e.code : "";
      if (code === "pet_already_booked") setError("One of your pets already has a sitter (or a pending request) at that time.");
      else if (code === "sitter_unavailable") setError(`${sitterName} no longer has room for these dates.`);
      else setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const row = (kind: Kind, label: string, w: When) => (
    <View style={styles.block} testID={`request-${kind}`}>
      <View style={styles.line}>
        <Text style={styles.label}>{label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} day`} onPress={() => setPicker({ kind, part: "day" })} style={styles.pill} testID={`request-${kind}-day`}>
          <Text style={styles.pillText}>{formatDay(w.day)}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} time`} onPress={() => setPicker({ kind, part: "time" })} style={styles.pill} testID={`request-${kind}-time`}>
          <Text style={styles.pillText}>{formatTime(w.time)}</Text>
        </Pressable>
      </View>
      <View style={styles.line}>
        <Text style={styles.place} testID={`request-${kind}-place`}>
          {placeText(kind)}
        </Text>
        {houseSitting ? null : (
          <TextButton label={changing[kind] ? "Done" : "Change place"} onPress={() => setChanging((c) => ({ ...c, [kind]: !c[kind] }))} testID={`request-${kind}-change`} />
        )}
      </View>
      {changing[kind] && !houseSitting ? (
        <View style={styles.change}>
          <SegmentedControl
            options={[
              { value: "sitter_home", label: `${sitterName}'s` },
              { value: "owner_home", label: "My place" },
              { value: "other", label: "Elsewhere" },
            ]}
            value={places[kind].type}
            onChange={(type) => setPlaces((p) => ({ ...p, [kind]: { ...p[kind], type } }))}
            testID={`request-${kind}-type`}
          />
          {places[kind].type === "other" ? (
            <TextField
              label=""
              placeholder="Where, e.g. Christie Pits east gate"
              value={places[kind].note}
              maxLength={120}
              onChangeText={(text) => setPlaces((p) => ({ ...p, [kind]: { ...p[kind], note: text } }))}
              testID={`request-${kind}-note`}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Sheet
      visible={visible}
      title="Request booking"
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error} testID="request-error">
              {error}
            </Text>
          ) : problem && stay ? (
            <Text style={styles.error} testID="request-problem">
              {problem}
            </Text>
          ) : null}
          <Button label={sending ? "Sending…" : "Send request"} onPress={() => void send()} disabled={!!problem || sending} testID="request-send" />
        </View>
      }
      testID="request-sheet"
    >
      {stay ? (
        <View style={styles.pets} testID="request-pets">
          {shownPets.map((p) => (
            <Text key={p.id} style={styles.petChip}>{`${p.species ? SPECIES_EMOJI[p.species] : "🐾"} ${p.name}`}</Text>
          ))}
        </View>
      ) : (
        <View>
          {pets.map((pet) => (
            <CheckRow
              key={pet.id}
              label={`${SPECIES_EMOJI[pet.species]} ${pet.name}`}
              checked={petIds.includes(pet.id)}
              onChange={(on) => setPetIds((ids) => (on ? [...ids, pet.id] : ids.filter((x) => x !== pet.id)))}
              testID={`request-pet-${pet.name}`}
            />
          ))}
        </View>
      )}
      <View style={styles.card}>
        {row("drop", "Drop-off", dropOff)}
        <View style={styles.rule} />
        {row("pick", "Pick-up", pickUp)}
      </View>
      <View style={styles.noteLine}>
        <Text style={styles.noteLabel}>{`Note for ${sitterName}`}</Text>
        <NoteToggle open={noteOpen} filled={note.trim().length > 0} onPress={() => setNoteOpen((o) => !o)} testID="request-note-toggle" />
      </View>
      {noteOpen ? (
        <TextField label="" placeholder="e.g. Max gets anxious with loud noises" value={note} onChangeText={setNote} maxLength={500} multiline testID="request-note" />
      ) : null}

      <DayPickerSheet
        visible={picker?.part === "day"}
        title={picker?.kind === "pick" ? "Pick-up day" : "Drop-off day"}
        value={picker?.kind === "pick" ? pickUp.day : dropOff.day}
        minDay={picker?.kind === "pick" ? dropOff.day : today}
        onPick={(day) => picker && setWhen(picker.kind, { day })}
        onClose={() => setPicker(null)}
        testID="request-calendar"
      />
      <TimePickerSheet
        visible={picker?.part === "time"}
        title={picker?.kind === "pick" ? "Pick-up time" : "Drop-off time"}
        value={picker?.kind === "pick" ? pickUp.time : dropOff.time}
        onPick={(time) => {
          if (picker) setWhen(picker.kind, { time });
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
        testID="request-clock"
      />
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    pets: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    petChip: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    card: {
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    block: { gap: theme.spacing.xs },
    rule: { height: 1, backgroundColor: theme.color.border },
    line: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    label: { width: 84, fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    noteLabel: { flex: 1, fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    pill: {
      minHeight: 40,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      justifyContent: "center",
      backgroundColor: theme.color.background,
    },
    pillText: { fontSize: theme.fontSize.body, color: theme.color.text },
    place: { flex: 1, fontSize: theme.fontSize.small, color: theme.color.textMuted },
    change: { gap: theme.spacing.xs },
    noteLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    footer: { gap: theme.spacing.xs },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
  });
