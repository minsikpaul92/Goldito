import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { ComponentProps, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SPECIES_EMOJI } from "../features/pets/petFormat";
import { addDays, formatDay, formatDayRange, formatTime, shiftTime } from "../features/schedule/dates";
import { SitterSearch } from "../features/sitters/useSitterSearch";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";
import { Button } from "./ui/Button";
import { CheckRow } from "./ui/CheckRow";
import { ChoiceChips } from "./ui/ChoiceChips";
import { RangeCalendar } from "./ui/RangeCalendar";
import { Sheet } from "./ui/Sheet";
import { Slider } from "./ui/Slider";
import { Stepper } from "./ui/Stepper";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";
import { TimePickerSheet } from "./ui/TimePickerSheet";

type Open = "place" | "stay" | "pets" | null;
type IconName = ComponentProps<typeof Ionicons>["name"];

const TIME_STEP = 15;

/** "Oct 20" from "Tue, Oct 20". */
const shortDay = (day: string) => formatDay(day).replace(/^\w+,\s*/, "");

/** "Oct 20 - 22", or "Oct 30 - Nov 2" across months. */
function stayText(from: string, to: string): string {
  const a = shortDay(from);
  const b = shortDay(to);
  return a.split(" ")[0] === b.split(" ")[0] ? `${a} - ${b.split(" ")[1]}` : `${a} - ${b}`;
}

/**
 * One hotel-style line: a place (my home, here, an address or postal code), the stay (dates and times) and the
 * pets. Each part opens a sheet; the search runs by itself whenever anything changes.
 */
const KM_PICKS = [2, 5, 10, 25];

/** Stays people book most: tomorrow night, the coming weekend (Fri to Sun) and a week, from `today`. */
function quickStays(today: string): { id: string; label: string; from: string; to: string }[] {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  const toFri = (5 - weekday + 7) % 7 || 7;
  const fri = addDays(today, toFri);
  return [
    { id: "night", label: "1 night", from: addDays(today, 1), to: addDays(today, 2) },
    { id: "weekend", label: `Weekend · ${formatDayRange(fri, addDays(fri, 2))}`, from: fri, to: addDays(fri, 2) },
    { id: "week", label: "A week", from: addDays(today, 1), to: addDays(today, 8) },
  ];
}

export function SitterSearchBar({ search }: { search: SitterSearch }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState<Open>(null);
  const [clock, setClock] = useState<"drop" | "pick" | null>(null);
  const [typed, setTyped] = useState("");
  const close = () => setOpen(null);

  const { place, dropOff, pickUp, pets, petIds } = search;
  const datePicks = quickStays(search.today);
  const placeText = place.kind === "home" ? "My home" : place.kind === "here" ? "Current location" : place.label;
  const dateText = stayText(dropOff.day, pickUp.day);
  const petText = petIds.length === 1 ? pets.find((p) => p.id === petIds[0])?.name ?? "1 pet" : `${petIds.length} pets`;

  const segment = (icon: IconName, text: string, onPress: () => void, id: string, grow: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={onPress}
      style={[styles.segment, { flexShrink: grow }]}
      testID={id}
    >
      <Ionicons name={icon} size={theme.icon.sm} color={theme.color.text} />
      <Text style={styles.segmentText} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );

  const goAddress = async () => {
    if (await search.useAddress(typed)) {
      setTyped("");
      close();
    }
  };

  return (
    <View style={styles.wrap}>
    <View style={styles.bar} testID="sitter-search-bar">
      {segment("location-outline", placeText, () => setOpen("place"), "bar-place", 1)}
      <View style={styles.divider} />
      {segment("calendar-outline", dateText, () => setOpen("stay"), "bar-dates", 0)}
      <View style={styles.divider} />
      {segment("paw-outline", petText, () => (pets.length === 0 ? router.push("/owner/pets/new") : setOpen("pets")), "bar-pets", 0)}

      <Sheet
        visible={open === "place"}
        title="Where"
        onClose={close}
        footer={<Button label="Done" onPress={close} testID="place-done" />}
        testID="place-sheet"
      >
        <TextField
          label=""
          placeholder="Address or postal code"
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={() => void goAddress()}
          returnKeyType="search"
          autoCapitalize="characters"
          maxLength={120}
          testID="place-input"
        />
        <Button
          label="Use this place"
          variant="secondary"
          onPress={() => void goAddress()}
          disabled={typed.trim().length < 3 || search.locating}
          testID="place-use-address"
        />
        <CheckRow label="🏠 My home" checked={place.kind === "home"} onChange={() => search.useHome()} testID="place-home" />
        <CheckRow
          label="📍 Current location"
          checked={place.kind === "here"}
          onChange={() => void search.useHere()}
          testID="place-here"
        />
        {search.locating ? (
          <Text style={styles.hint} testID="place-locating">
            Looking…
          </Text>
        ) : null}
        {search.placeError ? (
          <Text style={styles.error} testID="place-error">
            {search.placeError}
          </Text>
        ) : null}
        {place.kind === "home" && search.home === null ? (
          <View style={styles.inline}>
            <Text style={styles.hint} testID="place-no-home">
              Your home isn't on the map yet.
            </Text>
            <TextButton label="Open Profile" onPress={() => (close(), router.push("/profile"))} style={styles.left} testID="place-open-profile" />
          </View>
        ) : null}
      </Sheet>

      <Sheet
        visible={open === "stay"}
        title="Dates"
        onClose={close}
        footer={<Button label="Done" onPress={close} testID="stay-done" />}
        testID="stay-sheet"
      >
        {/* Quick picks for the common stays; the calendar stays for anything else (design site: qa-sitter-card.html). */}
        <ChoiceChips
          options={datePicks.map((d) => ({ value: d.id, label: d.label }))}
          value={datePicks.filter((d) => d.from === dropOff.day && d.to === pickUp.day).map((d) => d.id)}
          onChange={(v) => {
            const pick = datePicks.find((d) => d.id === v[0]);
            if (!pick) return;
            search.setDropOff({ ...dropOff, day: pick.from });
            search.setPickUp({ ...pickUp, day: pick.to });
          }}
          testID="stay-quick"
        />
        <RangeCalendar
          start={dropOff.day}
          end={pickUp.day}
          minDay={search.today}
          onChange={(start, end) => {
            search.setDropOff({ ...dropOff, day: start });
            search.setPickUp({ ...pickUp, day: end });
          }}
          testID="stay-calendar"
        />
        <View style={styles.times}>
          <Text style={styles.label}>Drop-off</Text>
          <Stepper
            label="Drop-off time"
            value={formatTime(dropOff.time)}
            onDecrease={() => search.setDropOff({ ...dropOff, time: shiftTime(dropOff.time, -TIME_STEP) })}
            onIncrease={() => search.setDropOff({ ...dropOff, time: shiftTime(dropOff.time, TIME_STEP) })}
            onPressValue={() => setClock("drop")}
            testID="search-drop_off-time"
          />
          <Text style={styles.label}>Pick-up</Text>
          <Stepper
            label="Pick-up time"
            value={formatTime(pickUp.time)}
            onDecrease={() => search.setPickUp({ ...pickUp, time: shiftTime(pickUp.time, -TIME_STEP) })}
            onIncrease={() => search.setPickUp({ ...pickUp, time: shiftTime(pickUp.time, TIME_STEP) })}
            onPressValue={() => setClock("pick")}
            testID="search-pick_up-time"
          />
        </View>
        {search.problem ? (
          <Text style={styles.error} testID="search-trip-problem">
            {search.problem}
          </Text>
        ) : null}
        <TimePickerSheet
          visible={clock === "drop"}
          title="Drop-off time"
          value={dropOff.time}
          onPick={(time) => (search.setDropOff({ ...dropOff, time }), setClock(null))}
          onClose={() => setClock(null)}
          testID="search-drop_off-clock"
        />
        <TimePickerSheet
          visible={clock === "pick"}
          title="Pick-up time"
          value={pickUp.time}
          onPick={(time) => (search.setPickUp({ ...pickUp, time }), setClock(null))}
          onClose={() => setClock(null)}
          testID="search-pick_up-clock"
        />
      </Sheet>

      <Sheet
        visible={open === "pets"}
        title="Who's staying?"
        onClose={close}
        footer={<Button label="Done" onPress={close} testID="pets-done" />}
        testID="pets-sheet"
      >
        {pets.map((pet) => (
          <CheckRow
            key={pet.id}
            label={`${SPECIES_EMOJI[pet.species]} ${pet.name}`}
            checked={petIds.includes(pet.id)}
            onChange={(on) => search.setPetIds(on ? [...petIds, pet.id] : petIds.filter((x) => x !== pet.id))}
            testID={`search-pet-${pet.name}`}
          />
        ))}
        {petIds.length === 0 ? <Text style={styles.error}>Pick at least one pet.</Text> : null}
      </Sheet>
    </View>
    <View style={styles.radius}>
      <View style={styles.radiusHead}>
        <Text style={styles.label}>Within</Text>
        <Text style={styles.radiusValue} testID="radius-value">{`${search.radiusKm} km`}</Text>
      </View>
      <Slider
        value={search.radiusKm}
        min={1}
        max={100}
        onChange={search.setRadiusKm}
        label="Search radius"
        valueText={`${search.radiusKm} km`}
        testID="radius-slider"
      />
      <ChoiceChips
        options={KM_PICKS.map((k) => ({ value: String(k), label: `${k} km` }))}
        value={KM_PICKS.includes(search.radiusKm) ? [String(search.radiusKm)] : []}
        onChange={(v) => v[0] && search.setRadiusKm(Number(v[0]))}
        testID="radius-quick"
      />
    </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      gap: theme.spacing.sm,
    },
    radius: {
      paddingHorizontal: theme.spacing.sm,
    },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      paddingLeft: theme.spacing.sm,
      paddingRight: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    segment: {
      flexGrow: 1,
      flexBasis: "auto",
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      minHeight: 44,
    },
    segmentText: {
      flexShrink: 1,
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    divider: {
      width: 1,
      height: 24,
      backgroundColor: theme.color.border,
    },
    go: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.primary,
    },
    times: {
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    inline: {
      gap: theme.spacing.xs,
    },
    left: {
      alignSelf: "flex-start",
      paddingHorizontal: 0,
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
    radiusHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
    },
    radiusValue: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.primary,
    },
  });
