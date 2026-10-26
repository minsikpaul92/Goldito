import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AddressInput } from "./AddressInput";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { ChoiceChips } from "./ui/ChoiceChips";
import { DayPickerSheet } from "./ui/DayPickerSheet";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Sheet } from "./ui/Sheet";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";
import { TimePickerSheet } from "./ui/TimePickerSheet";
import { ChatPet, postBookingRequestCard } from "../features/chat/chatApi";
import { loadOwnerDefault, loadSitterWays, openingPlace, saveOwnerDefault } from "../features/chat/handoffDefaults";
import { SPECIES_EMOJI } from "../features/pets/petFormat";
import { useMyPets } from "../features/pets/useMyPets";
import { loadRoleProfile } from "../features/profile/profileApi";
import { addDays, appToday, formatDay, formatTime, isoToZoned, zonedToIso } from "../features/schedule/dates";
import { SERVICE_LABEL, ServiceType, getSitterProfile } from "../features/sitters/sitterApi";
import { BookingError, LocationType, requestBooking } from "../lib/bookings";
import { earliestTime, freshStay, nextSlot, tripProblem } from "../lib/trip";
import { useSession } from "../providers/SessionProvider";
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
/** `placed` is the address text that was found on the map, for "elsewhere". */
type Place = { type: LocationType; note: string; placed: string | null };
type Picker = { kind: Kind; part: "day" | "time" } | null;

/** "Max", "Max and Mochi", "Max, Mochi and Luna". */
function stayNames(ids: string[], all: { id: string; name: string }[]): string {
  const names = ids.map((id) => all.find((p) => p.id === id)?.name).filter(Boolean) as string[];
  if (names.length === 0) return "Your pet";
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Oct 26 to 28 · 2 nights" (same month) or "Oct 30 to Nov 2 · 3 nights", as in Figma. */
function datesLine(from: string, to: string): string {
  const nights = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const end = sameMonth ? String(Number(to.slice(8, 10))) : formatDay(to);
  return `${formatDay(from)} to ${end} · ${nights} night${nights === 1 ? "" : "s"}`;
}

/**
 * Request booking as a sheet over the chat (3D.7 groundwork): the stay from the search (pets, dates, times), the place of
 * each handoff (the sitter's place unless changed here), an optional note. One send puts the request to the sitter and
 * a card with everything into the chat. How the pets travel was settled in the profiles; only the place can change.
 */
export function RequestBookingSheet({ visible, onClose, threadId, sitterId, sitterName, stay, onSent }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const { pets } = useMyPets();
  const { profile } = useSession();
  const [myAddress, setMyAddress] = useState<string | null>(null);
  const [sitterArea, setSitterArea] = useState<string | null>(null);
  const today = appToday();

  const [petIds, setPetIds] = useState<string[]>([]);
  const [dropOff, setDropOff] = useState<When>({ day: addDays(today, 1), time: "09:00" });
  const [pickUp, setPickUp] = useState<When>({ day: addDays(today, 3), time: "17:00" });
  const [places, setPlaces] = useState<Record<Kind, Place>>({ drop: { type: "sitter_home", note: "", placed: null }, pick: { type: "sitter_home", note: "", placed: null } });
  const [changing, setChanging] = useState<Record<Kind, boolean>>({ drop: false, pick: false });
  const [note, setNote] = useState("");
  const [datesOpen, setDatesOpen] = useState(false);
  /** The chat's drop-off had passed, so the sheet opened on the next slot (#364). */
  const [moved, setMoved] = useState(false);
  const [services, setServices] = useState<ServiceType[]>(["boarding"]);
  const [picker, setPicker] = useState<Picker>(null);
  const [service, setService] = useState<ServiceType>("boarding");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every time the sheet opens it starts from the chat's stay.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setNote("");
    setDatesOpen(false);
    setMoved(false);
    setChanging({ drop: false, pick: false });
    setPlaces({ drop: { type: "sitter_home", note: "", placed: null }, pick: { type: "sitter_home", note: "", placed: null } });
    if (stay) {
      setPetIds(stay.pets.map((p) => p.id));
      // Never open on a drop-off that has passed: move it to the next slot and show the dates.
      const fresh = freshStay(isoToZoned(stay.dropOffAt), isoToZoned(stay.pickUpAt));
      setDropOff(fresh.drop);
      setPickUp(fresh.pick);
      setMoved(fresh.moved);
      setDatesOpen(fresh.moved);
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
      .then((s) => {
        setService(s?.services.includes("boarding") || !s ? "boarding" : "house_sitting");
        setServices(s?.services?.length ? s.services : ["boarding"]);
        setSitterArea(s?.serviceArea ?? null);
      })
      .catch(() => undefined);
  }, [visible, sitterId]);

  // The places open on my usual one (the last request), else the sitter's preference (3D.8 defaults).
  useEffect(() => {
    if (!visible || !profile) return;
    let current = true;
    Promise.all([loadOwnerDefault(profile.id).catch(() => null), loadSitterWays(sitterId).catch(() => null)]).then(([mine, ways]) => {
      if (!current) return;
      const type = openingPlace(mine, ways);
      setPlaces({ drop: { type, note: "", placed: null }, pick: { type, note: "", placed: null } });
    });
    return () => {
      current = false;
    };
  }, [visible, profile, sitterId]);

  // My own address, so "my place" says where.
  useEffect(() => {
    if (!visible || !profile) return;
    loadRoleProfile(profile.id, "owner")
      .then((r) => setMyAddress(r.fields.home_address ?? null))
      .catch(() => undefined);
  }, [visible, profile]);

  const houseSitting = service === "house_sitting";
  const draft = (w: When, p: Place) => ({ ...w, locationType: houseSitting ? ("owner_home" as const) : p.type, note: p.note });
  const problem =
    tripProblem(petIds, draft(dropOff, places.drop), draft(pickUp, places.pick)) ??
    (!houseSitting && ([places.drop, places.pick] as Place[]).some((p) => p.type === "other" && (!p.note.trim() || p.note.trim() !== p.placed))
      ? "Check the address of the place."
      : null);

  const setWhen = (kind: Kind, change: Partial<When>) => {
    if (kind === "drop") {
      let next = { ...dropOff, ...change };
      // Today picked while the time has passed: the next slot instead.
      if (Date.parse(zonedToIso(next.day, next.time)) <= Date.now()) next = nextSlot();
      setDropOff(next);
      if (next.day > pickUp.day) setPickUp({ ...pickUp, day: next.day });
    } else setPickUp({ ...pickUp, ...change });
  };

  const placeText = (kind: Kind): string => {
    if (houseSitting) return myAddress ? `At my place, ${myAddress}` : "At my place";
    const p = places[kind];
    if (p.type === "sitter_home") return `At ${sitterName}'s place${sitterArea ? `, ${sitterArea}` : ""}`;
    if (p.type === "owner_home") return myAddress ? `At my place, ${myAddress}` : "At my place";
    return p.placed ? `At ${p.placed}` : "Somewhere else";
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
      if (profile && !houseSitting) void saveOwnerDefault(profile.id, places.drop.type).catch(() => undefined);
      toast.show(`Request sent to ${sitterName}`);
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
            <AddressInput
              label=""
              placeholder="Address or postal code"
              value={places[kind].note}
              onChangeText={(text) => setPlaces((p) => ({ ...p, [kind]: { ...p[kind], note: text } }))}
              placed={places[kind].placed}
              onPick={(s) => setPlaces((p) => ({ ...p, [kind]: { ...p[kind], note: s.label, placed: s.label } }))}
              testID={`request-${kind}-address`}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Sheet
      dirty={note.trim() !== "" || places.drop.note.trim() !== "" || places.pick.note.trim() !== ""}
      discardTitle="Discard your request?"
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
          <Button label={sending ? "Sending…" : "Send"} onPress={() => void send()} disabled={!!problem || sending} testID="request-send" />
        </View>
      }
      testID="request-sheet"
    >
      <Card tone="mint" style={styles.panel}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Service</Text>
        <ChoiceChips
          options={services.map((v) => ({ value: v, label: SERVICE_LABEL[v].replace(/^\S+\s/, "") }))}
          value={[service]}
          onChange={(v) => v[0] && setService(v[0] as ServiceType)}
          testID="request-service"
        />
        <Text style={styles.hint}>{houseSitting ? `${sitterName} stays at your home.` : `${stayNames(petIds, pets)} ${petIds.length > 1 ? "stay" : "stays"} at ${sitterName}'s home.`}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Dates</Text>
        <Pressable accessibilityRole="button" onPress={() => setDatesOpen((o) => !o)} style={styles.dateField} testID="request-dates">
          <Text style={styles.dateText} numberOfLines={1}>{datesLine(dropOff.day, pickUp.day)}</Text>
          <Text style={styles.link}>{datesOpen ? "Done" : "Change"}</Text>
        </Pressable>
        {moved ? (
          <Text style={styles.hint} testID="request-moved">
            The chat's drop-off had passed, so it moved.
          </Text>
        ) : null}
        {datesOpen ? (
          <View style={styles.card}>
            {row("drop", "Drop-off", dropOff)}
            <View style={styles.rule} />
            {row("pick", "Pick-up", pickUp)}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          Pets <Text style={styles.sectionHint}>· pick one or both</Text>
        </Text>
        <ChoiceChips
          multi
          options={pets.map((p) => ({ value: p.id, label: `${SPECIES_EMOJI[p.species]} ${p.name}` }))}
          value={petIds}
          onChange={setPetIds}
          testID="request-pet"
        />
        <Text style={styles.hint}>Their profiles (breed, age, allergies) go with your question.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Your question (optional)</Text>
        <TextField label="" placeholder={`e.g. Can ${petIds.length === 1 ? (pets.find((p) => p.id === petIds[0])?.name ?? "my pet") : "my pet"} take a pill in a treat?`} value={note} onChangeText={setNote} maxLength={500} multiline soft testID="request-note" />
      </View>

      </Card>

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
        minTime={picker ? earliestTime(picker.kind === "pick" ? pickUp.day : dropOff.day) : null}
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
    panel: { gap: 14, padding: theme.spacing.md },
    section: { gap: theme.spacing.sm },
    sectionLabel: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    sectionHint: { fontSize: theme.fontSize.caption, fontWeight: theme.fontWeight.medium, color: theme.color.cardTextMuted },
    hint: { fontSize: theme.fontSize.small, color: theme.color.cardTextMuted },
    dateField: {
      minHeight: theme.layout.touchTarget,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      paddingHorizontal: 14,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: theme.color.text,
      backgroundColor: theme.color.surface,
    },
    dateText: { flex: 1, fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    link: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primary },
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
    footer: { gap: theme.spacing.xs },
    error: { fontSize: theme.fontSize.small, color: theme.color.error },
  });
