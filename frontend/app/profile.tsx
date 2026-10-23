import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DemoTools } from "../components/DemoTools";
import { AddressInput } from "../components/AddressInput";
import { SitterBadges } from "../components/SitterBadges";
import { ProfilePhotoGallery } from "../components/ProfilePhotoGallery";
import { SitterAnswersSummary } from "../components/SitterAnswersSummary";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CheckRow } from "../components/ui/CheckRow";
import { Collapsible } from "../components/ui/Collapsible";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingView } from "../components/ui/LoadingView";
import { Screen } from "../components/ui/Screen";
import { TextButton } from "../components/ui/TextButton";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Sheet } from "../components/ui/Sheet";
import { TextField } from "../components/ui/TextField";
import {
  AiReplyMode,
  RoleProfile,
  getAiReplyMode,
  loadRoleProfile,
  reindexSitterPolicies,
  saveProfile,
  setAiReplyMode,
} from "../features/profile/profileApi";
import { isDemoAccount, isDemoToolsEnabled } from "../lib/demoReset";
import { LatLng, LocationError, getCurrentPosition } from "../lib/location";
import { AddressSuggestion, PinPlace, reverseGeocode } from "../lib/transit";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

type Draft = Record<string, string>;

type FieldSpec = { key: string; label: string; placeholder?: string; multiline?: boolean; numeric?: boolean };

/** `label` null: always shown. Otherwise a card that opens and closes; it starts closed and shows its value. */
type FieldGroup = { id: string; label: string | null; fields: FieldSpec[] };

const HOME_GROUP: FieldGroup = {
  id: "home",
  label: "Home address",
  fields: [
    { key: "home_address", label: "Home address", placeholder: "Shown after booking" },
    { key: "home_address_2", label: "Address details", placeholder: "e.g. Unit 1204, buzz 55" },
    { key: "home_postal_code", label: "Postal code", placeholder: "e.g. M6J 1A1" },
  ],
};

const OWNER_GROUPS: FieldGroup[] = [
  HOME_GROUP,
  {
    id: "emergency",
    label: "Emergency contact",
    fields: [
      { key: "emergency_contact_name", label: "Name" },
      { key: "emergency_contact_phone", label: "Phone" },
    ],
  },
  {
    id: "vet",
    label: "Vet",
    fields: [
      { key: "vet_clinic_name", label: "Clinic" },
      { key: "vet_clinic_phone", label: "Phone" },
    ],
  },
  { id: "packing", label: "Packing list", fields: [{ key: "packing_list", label: "Packing list" }] },
];

const SITTER_GROUPS: FieldGroup[] = [
  {
    id: "bio",
    label: null,
    fields: [{ key: "bio", label: "About you", placeholder: "A few lines for owners", multiline: true }],
  },
  HOME_GROUP,
  {
    id: "home_notes",
    label: "About your home",
    fields: [{ key: "home_notes", label: "About your home", placeholder: "Yard, other pets, stairs", multiline: true }],
  },
  {
    id: "experience",
    label: "Experience",
    fields: [{ key: "experience_years", label: "Years of experience", numeric: true }],
  },
  {
    id: "parking",
    label: "Visitor parking",
    fields: [{ key: "visitor_parking", label: "Visitor parking", placeholder: "e.g. Spot B-12" }],
  },
  {
    id: "lobby",
    label: "Lobby notes",
    fields: [{ key: "lobby_notes", label: "Lobby notes", placeholder: "e.g. Buzz 1204", multiline: true }],
  },
  {
    id: "policies",
    label: "House rules",
    fields: [
      { key: "policies", label: "House rules", placeholder: "Cancellation, pets you don't take", multiline: true },
    ],
  },
];

const POSTAL_END = /[,\s]+([A-Z]\d[A-Z])(?:\s?(\d[A-Z]\d))?$/i;

/** "55 Mill St, Toronto, ON M5A 3C4" -> the street line and the postal code, kept apart. */
function splitPostal(label: string): { street: string; postal: string | null } {
  const match = label.match(POSTAL_END);
  if (!match) return { street: label, postal: null };
  return {
    street: label.slice(0, match.index).trim(),
    postal: (match[2] ? `${match[1]} ${match[2]}` : match[1]).toUpperCase(),
  };
}

/** What owners see as the sitter's area: the city (second part of the street line) and the postal area, "Toronto M5A". */
function serviceAreaOf(address: string | null, postal: string | null): string | null {
  const city = (address ?? "").split(",").map((part) => part.trim()).filter(Boolean)[1];
  const code = (postal ?? "").replace(/\s/g, "").slice(0, 3).toUpperCase();
  const parts = [city && !/^[A-Z]{2}$/.test(city) ? city : null, /^[A-Z]\d[A-Z]$/.test(code) ? code : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

const MAX_SPOTS = 3;
const MAX_PACKING = 20;

type Service = "boarding" | "house_sitting";

const SERVICES: { value: Service; label: string; hint: string }[] = [
  { value: "boarding", label: "🏠 Boarding", hint: "Pets stay at your place" },
  { value: "house_sitting", label: "🔑 House sitting", hint: "You care for them at the owner's place" },
];

/** Text fields only — services and meeting spots have their own controls. */
function toDraft(profile: RoleProfile): Draft {
  return Object.fromEntries(
    Object.entries(profile.fields)
      .filter(([, value]) => value == null || typeof value === "string" || typeof value === "number" || Array.isArray(value))
      .filter(([key]) => key !== "services" && key !== "meet_spots")
      .map(([key, value]) => {
        if (Array.isArray(value)) return [key, value.join("\n")];
        return [key, value == null ? "" : String(value)];
      }),
  );
}

function cleanItems(items: string[]): string[] {
  return items.map((x) => x.trim()).filter(Boolean);
}

function padSpots(spots: string[]): string[] {
  return [...spots, "", "", ""].slice(0, MAX_SPOTS);
}

/** Trimmed, non-empty, no repeats (004 check: ≤ 3 labels of ≤ 60 chars). */
function cleanSpots(spots: string[]): string[] {
  const out: string[] = [];
  for (const s of spots.map((x) => x.trim()).filter(Boolean)) {
    if (!out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, MAX_SPOTS);
}

/** Role profile (phase-03 3.8): edit only. Settings, What's new and Privacy are reached from the menu. */
export default function ProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const session = useSession();
  const toast = useToast();
  const [loaded, setLoaded] = useState<RoleProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [spots, setSpots] = useState<string[]>(padSpots([]));
  // How many spot fields are showing: one to start, "+" adds up to MAX_SPOTS.
  const [spotFields, setSpotFields] = useState(1);
  const [packing, setPacking] = useState<string[]>([""]);
  // Groups the person opened or closed with a header tap (before a tap, a group with a value is open).
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [services, setServices] = useState<Service[]>(["boarding"]);
  const [multiOwner, setMultiOwner] = useState(false);
  const [aiMode, setAiMode] = useState<AiReplyMode>({ mode: "manual", consented: false });
  const [consenting, setConsenting] = useState(false);
  const [home, setHome] = useState<LatLng | null>(null);
  // The pin came from "Use my current location" this visit: an address typed later must not replace it.
  const [pinFromGps, setPinFromGps] = useState(false);
  const [locating, setLocating] = useState(false);
  const [homeNote, setHomeNote] = useState<string | null>(null);
  // "Trinity Bellwoods, Toronto" for the pin; `undefined` while it is being looked up, `null` when it has no name.
  const [homePlace, setHomePlace] = useState<PinPlace | null | undefined>(undefined);
  // The address text that is placed on the map (it matches the pin). Anything else typed has to be checked first.
  const [placedAddress, setPlacedAddress] = useState<string | null>(null);

  const profile = session.status === "signedIn" ? session.profile : null;

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    loadRoleProfile(profile.id, profile.role)
      .then((result) => {
        setLoaded(result);
        // An address saved with its postal code inside it is split: the street here, the code in its own field.
        const nextDraft = toDraft(result);
        const split = splitPostal(nextDraft.home_address ?? "");
        if (split.postal) {
          nextDraft.home_address = split.street;
          if (!nextDraft.home_postal_code) nextDraft.home_postal_code = split.postal;
        }
        setDraft(nextDraft);
        setSpots(padSpots(result.fields.meet_spots));
        setSpotFields(Math.max(1, Math.min(MAX_SPOTS, result.fields.meet_spots.length)));
        setHome(
          result.fields.home_lat != null && result.fields.home_lng != null
            ? { lat: result.fields.home_lat, lng: result.fields.home_lng }
            : null,
        );
        setPlacedAddress(
          result.fields.home_address && result.fields.home_lat != null && result.fields.home_lng != null
            ? split.postal
              ? split.street
              : result.fields.home_address
            : null,
        );
        if (result.role === "owner" && result.fields.packing_list?.length) setPacking(result.fields.packing_list);
        if (result.role === "sitter") {
          setServices(result.fields.services);
          setMultiOwner(result.fields.accepts_multiple_owners ?? false);
          void getAiReplyMode().then(setAiMode);
        }
      })
      .catch((error: Error) => setLoadError(error.message));
    // Load once per user; later name edits are local until saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role]);

  // Name the place the pin is on, so the person can see where it landed (and spot a wrong one).
  const pinLat = home?.lat;
  const pinLng = home?.lng;
  useEffect(() => {
    if (!pinFromGps || pinLat == null || pinLng == null) {
      setHomePlace(undefined);
      return;
    }
    let current = true;
    setHomePlace(undefined);
    void reverseGeocode({ lat: pinLat, lng: pinLng }).then((place) => {
      if (!current) return;
      setHomePlace(place);
      // The location fills the home address (street, city, postal area); the person adds the house number.
      if (place?.address) {
        // The street line and the postal code go into their own fields.
        const street = place.postal && place.address.endsWith(`, ${place.postal}`) ? place.address.slice(0, -(place.postal.length + 2)) : place.address;
        setDraft((prev) => ({ ...prev, home_address: street, ...(place.postal ? { home_postal_code: place.postal } : {}) }));
        setPlacedAddress(street);
      }
    });
    return () => {
      current = false;
    };
  }, [pinFromGps, pinLat, pinLng]);

  if (session.status === "loading") return <LoadingView />;
  if (!profile) return <Redirect href="/welcome" />;
  if (loadError) {
    return (
      <Screen>
        <EmptyState emoji="🐾" title="Couldn't load your profile" message={loadError} />
      </Screen>
    );
  }
  if (!loaded) return <LoadingView />;

  const groups = loaded.role === "owner" ? OWNER_GROUPS : SITTER_GROUPS;
  const isOpen = (group: FieldGroup) => group.label === null || opened[group.id] === true;
  const setGroupOpen = (id: string, on: boolean) => setOpened((prev) => ({ ...prev, [id]: on }));
  const spotsOpen = opened.spots === true;
  /** What a closed card shows under its title: the value, on one line. */
  const summaryOf = (group: FieldGroup): string => {
    if (group.id === "packing") {
      const n = cleanItems(packing).length;
      return n === 0 ? "" : n === 1 ? "1 item" : `${n} items`;
    }
    const keys = group.id === "home" ? ["home_address", "home_postal_code"] : group.fields.map((f) => f.key);
    const values = keys.map((key) => (draft[key] ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
    if (group.id === "experience" && values[0]) return `${values[0]} years`;
    return values.join(", ");
  };

  async function save() {
    if (!profile || !loaded) return;
    const found: Record<string, string> = {};
    const name = displayName.trim();
    if (!name) found.display_name = "Enter the name others will see.";
    const experience = (draft.experience_years ?? "").trim();
    if (loaded.role === "sitter" && experience && !/^\d{1,2}$/.test(experience)) {
      found.experience_years = "Enter whole years, e.g. 3.";
    }
    if (loaded.role === "sitter" && services.length === 0) found.services = "Pick at least one service.";
    const meetSpots = cleanSpots(spots);

    const value = (key: string) => {
      const trimmed = (draft[key] ?? "").trim();
      return trimmed === "" ? null : trimmed;
    };
    const packingList = cleanItems(packing);
    // The address is required and has to be one that was found on the map (Check address, or the current location).
    const address = value("home_address");
    const postal = value("home_postal_code");
    const pin = home;
    let pinNote: string | null = null;
    if (!address) found.home_address = "Add your home address.";
    else if (address !== placedAddress || !pin) found.home_address = "Check your address so it's on the map.";
    setErrors(found);
    // An error inside a closed group would be invisible.
    for (const group of groups) if (group.fields.some((f) => found[f.key])) setGroupOpen(group.id, true);
    if (Object.keys(found).length > 0) return;
    if (pinFromGps && pin && homePlace) pinNote = `Pin saved near ${homePlace.label}`;
    const next: RoleProfile =
      loaded.role === "owner"
        ? {
            role: "owner",
            fields: {
              home_address: address,
              home_address_2: value("home_address_2"),
              home_postal_code: postal,
              home_lat: pin?.lat ?? null,
              home_lng: pin?.lng ?? null,
              emergency_contact_name: value("emergency_contact_name"),
              emergency_contact_phone: value("emergency_contact_phone"),
              vet_clinic_name: value("vet_clinic_name"),
              vet_clinic_phone: value("vet_clinic_phone"),
              meet_spots: meetSpots,
              packing_list: packingList,
            },
          }
        : {
            role: "sitter",
            fields: {
              bio: value("bio"),
              // Owners see only a rough place: the city and postal area of the address.
              service_area: serviceAreaOf(address, postal) ?? loaded.fields.service_area,
              experience_years: experience ? Number(experience) : null,
              home_notes: value("home_notes"),
              home_address: address,
              home_address_2: value("home_address_2"),
              home_postal_code: postal,
              home_lat: pin?.lat ?? null,
              home_lng: pin?.lng ?? null,
              services,
              meet_spots: meetSpots,
              visitor_parking: value("visitor_parking"),
              lobby_notes: value("lobby_notes"),
              accepts_multiple_owners: multiOwner,
              policies: value("policies"),
            },
          };

    setSaving(true);
    setSaveError(null);
    try {
      await saveProfile(profile.id, name, next);
      if (next.role === "sitter" && loaded.role === "sitter" && (next.fields.policies ?? null) !== (loaded.fields.policies ?? null)) {
        void reindexSitterPolicies();
      }
      session.patchProfile({ displayName: name });
      setLoaded(next);
      setHome(pin);
      toast.show(pinNote ? `Profile saved · ${pinNote}` : "Profile saved");
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /** The person picked one of the real addresses: its text and its point become the home address and pin. */
  function pickSuggestion(suggestion: AddressSuggestion) {
    const { street, postal } = splitPostal(suggestion.label);
    setDraft((prev) => ({ ...prev, home_address: street, ...(postal ? { home_postal_code: postal } : {}) }));
    setPlacedAddress(street);
    setHome(suggestion.point);
    setPinFromGps(false);
    setErrors((prev) => ({ ...prev, home_address: "" }));
  }

  async function useCurrentLocation() {
    setLocating(true);
    setHomeNote(null);
    try {
      setHome(await getCurrentPosition());
      setPinFromGps(true);
      toast.show("Location found. Tap Save to keep it");
    } catch (error) {
      setHomeNote(
        error instanceof LocationError && error.reason === "denied"
          ? "Location is off. Allow it in your browser settings, or check your address instead."
          : "Couldn't read your location. Try again, or check your address instead.",
      );
    } finally {
      setLocating(false);
    }
  }

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <>
          {saveError ? (
            <Text accessibilityRole="alert" style={styles.footerError}>
              {saveError}
            </Text>
          ) : null}
          <Button label={saving ? "Saving…" : "Save"} onPress={() => void save()} disabled={saving} testID="profile-save" />
        </>
      }
    >
      <Text style={styles.role}>{profile.role === "owner" ? "Pet owner" : "Pet sitter"}</Text>
      <View style={styles.group} testID="profile-photos-group">
        <Text style={styles.groupTitle}>Your photos</Text>
        <ProfilePhotoGallery profileId={profile.id} />
      </View>
      {profile.role === "sitter" ? <SitterBadges sitterId={profile.id} /> : null}
      <TextField
        label="Your name"
        value={displayName}
        onChangeText={setDisplayName}
        error={errors.display_name}
        testID="profile-display_name"
      />
      {groups.map((group) => {
        const body =
          group.id === "home" ? (
            <>
              <AddressInput
                label=""
                value={draft.home_address ?? ""}
                onChangeText={(text) => setDraft((prev) => ({ ...prev, home_address: text }))}
                placed={home ? placedAddress : null}
                onPick={pickSuggestion}
                placeholder={group.fields[0].placeholder}
                error={errors.home_address}
                testID="profile-home_address"
              />
              <Button
                label={locating ? "Locating…" : "📍 Use my current location"}
                variant="secondary"
                onPress={() => void useCurrentLocation()}
                disabled={locating}
                testID="profile-use-location"
              />
              {homeNote ? (
                <Text style={styles.muted} testID="profile-home-pin-note">
                  {homeNote}
                </Text>
              ) : null}
              <TextField
                label="Address details"
                value={draft.home_address_2 ?? ""}
                onChangeText={(text) => setDraft((prev) => ({ ...prev, home_address_2: text }))}
                placeholder={group.fields[1].placeholder}
                maxLength={120}
                testID="profile-home_address_2"
              />
              <TextField
                label="Postal code"
                value={draft.home_postal_code ?? ""}
                onChangeText={(text) => setDraft((prev) => ({ ...prev, home_postal_code: text }))}
                placeholder={group.fields[2].placeholder}
                maxLength={10}
                autoCapitalize="characters"
                testID="profile-home_postal_code"
              />
            </>
          ) : group.id === "packing" ? (
            <>
              {packing.map((item, i) => (
                <View key={i} style={styles.packingRow}>
                  <Text style={styles.packingBox}>☐</Text>
                  <View style={styles.packingField}>
                    <TextField
                      label=""
                      accessibilityLabel={`Item ${i + 1}`}
                      value={item}
                      onChangeText={(text) => setPacking((cur) => cur.map((x, k) => (k === i ? text : x)))}
                      placeholder={i === 0 ? "e.g. Food" : undefined}
                      maxLength={60}
                      testID={`profile-packing-${i + 1}`}
                    />
                  </View>
                  {packing.length > 1 || item ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove item"
                      onPress={() => setPacking((cur) => (cur.length > 1 ? cur.filter((_, k) => k !== i) : [""]))}
                      style={styles.packingRemove}
                      testID={`profile-packing-remove-${i + 1}`}
                    >
                      <Text style={styles.packingRemoveText}>✕</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {packing.length < MAX_PACKING ? (
                <TextButton
                  label="+ Add item"
                  onPress={() => setPacking((cur) => [...cur, ""])}
                  style={styles.addRow}
                  testID="profile-packing-add"
                />
              ) : null}
            </>
          ) : (
            group.fields.map((field) => (
              <TextField
                key={field.key}
                // A group with one field is already named by its header.
                label={group.label !== null && group.fields.length === 1 ? "" : field.label}
                accessibilityLabel={field.label}
                value={draft[field.key] ?? ""}
                onChangeText={(text) => setDraft((prev) => ({ ...prev, [field.key]: text }))}
                placeholder={field.placeholder}
                multiline={field.multiline}
                inputMode={field.numeric ? "numeric" : undefined}
                error={errors[field.key]}
                testID={`profile-${field.key}`}
              />
            ))
          );
        if (group.label === null) return <View key={group.id}>{body}</View>;
        const open = isOpen(group);
        return (
          <Collapsible
            key={group.id}
            title={group.label}
            open={open}
            summary={summaryOf(group)}
            onToggle={() => setGroupOpen(group.id, !open)}
            testID={`profile-group-${group.id}`}
            toggleTestID={`profile-add-${group.id}`}
          >
            {body}
          </Collapsible>
        );
      })}
      {loaded.role === "owner" ? (
        <Card style={styles.navCard}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/owner/home-access")}
            style={styles.navRow}
            testID="profile-home-access"
          >
            <Text style={styles.navTitle}>Entry info</Text>
            <Text style={styles.navChevron}>›</Text>
          </Pressable>
        </Card>
      ) : null}
      <Collapsible
        title="Meeting spots"
        open={spotsOpen}
        summary={cleanSpots(spots).join(", ")}
        onToggle={() => setGroupOpen("spots", !spotsOpen)}
        testID="profile-spots"
        toggleTestID="profile-add-spots"
      >
        <Text style={styles.muted}>Public places only. Up to 3.</Text>
        {spots.slice(0, spotFields).map((spot, i) => (
          <View key={i} style={styles.spotRow}>
            <View style={styles.packingField}>
              <TextField
                label={`Spot ${i + 1}`}
                value={spot}
                onChangeText={(text) => setSpots((cur) => cur.map((s, k) => (k === i ? text : s)))}
                placeholder={i === 0 ? "e.g. Christie Pits, east entrance" : undefined}
                maxLength={60}
                testID={`profile-spot-${i + 1}`}
              />
            </View>
            {spotFields > 1 || spot ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove spot ${i + 1}`}
                onPress={() => {
                  setSpots((cur) => padSpots(cur.filter((_, k) => k !== i)));
                  setSpotFields((n) => Math.max(1, n - 1));
                }}
                style={styles.spotRemove}
                testID={`profile-spot-remove-${i + 1}`}
              >
                <Text style={styles.packingRemoveText}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {spotFields < MAX_SPOTS ? (
          <TextButton label="+ Add another spot" onPress={() => setSpotFields((n) => Math.min(MAX_SPOTS, n + 1))} style={styles.addRow} testID="profile-add-spot" />
        ) : null}
      </Collapsible>
      {loaded.role === "sitter" ? (
        <Card style={styles.card} testID="profile-services">
          <Text style={styles.groupTitle}>Services you offer</Text>
          {SERVICES.map((s) => (
            <CheckRow
              key={s.value}
              label={s.label}
              hint={s.hint}
              checked={services.includes(s.value)}
              onChange={(on) => setServices((cur) => (on ? [...cur, s.value] : cur.filter((x) => x !== s.value)))}
              testID={`profile-service-${s.value}`}
            />
          ))}
          {errors.services ? <Text style={styles.error}>{errors.services}</Text> : null}
          <CheckRow
            label="Take pets from more than one owner at a time"
            checked={multiOwner}
            onChange={setMultiOwner}
            testID="profile-multi-owner"
          />
        </Card>
      ) : null}
      {loaded.role === "sitter" ? (
        <Card style={styles.card} testID="profile-ai-replies">
          <Text style={styles.groupTitle}>AI replies</Text>
          <SegmentedControl
            options={[
              { value: "manual", label: "Manual approval" },
              { value: "auto", label: "Auto-send" },
            ]}
            value={aiMode.mode}
            onChange={(mode) => {
              if (mode === aiMode.mode) return;
              if (mode === "auto" && !aiMode.consented) {
                setConsenting(true);
                return;
              }
              setAiReplyMode(mode, false)
                .then(setAiMode)
                .catch((e: Error) => toast.show(e.message));
            }}
            testID="profile-ai-mode"
          />
          <Text style={styles.muted}>
            {aiMode.mode === "auto"
              ? "Replies that need nothing from you go out in your name after a short delay."
              : "You tap Send on every reply."}
          </Text>
          <Text style={styles.muted} testID="profile-ai-notice">
            AI drafts your replies and notes. You approve before anything is sent.
          </Text>
        </Card>
      ) : null}
      {loaded.role === "sitter" ? (
        <View style={styles.group} testID="profile-answers">
          <Text style={styles.groupTitle}>Your answers</Text>
          <SitterAnswersSummary sitterId={profile.id} />
          <Button
            label="Edit your answers"
            variant="secondary"
            onPress={() => router.push("/sitter-onboarding?edit=1")}
            testID="profile-answers-edit"
          />
        </View>
      ) : null}
      <Sheet visible={consenting} title="Turn on auto-send?" onClose={() => setConsenting(false)} testID="ai-consent-sheet">
        <Text style={styles.muted}>Replies go out in your name. You're responsible for what's sent.</Text>
        <Button
          label="Turn on auto-send"
          onPress={() => {
            setAiReplyMode("auto", true)
              .then((next) => {
                setAiMode(next);
                setConsenting(false);
              })
              .catch((e: Error) => toast.show(e.message));
          }}
          testID="ai-consent-confirm"
        />
      </Sheet>
      <View style={styles.privacy}>
        <Text style={styles.hint}>
          {profile.role === "owner"
            ? "Your address and emergency contact are shared only after a confirmed booking."
            : "Your address and home notes are shared only after a paid booking."}
        </Text>
      </View>
      {isDemoToolsEnabled && isDemoAccount(session.session?.user.email) ? <DemoTools /> : null}
    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.md,
    },
    role: {
      fontSize: theme.fontSize.small,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.textMuted,
      textTransform: "uppercase",
    },
    checkRow: { alignItems: "flex-start" },
    found: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.success },
    suggestions: { gap: theme.spacing.xs },
    suggestion: { alignSelf: "flex-start", paddingHorizontal: 0, minHeight: 36 },
    addRow: { alignSelf: "flex-start", paddingHorizontal: 0 },
    card: { gap: theme.spacing.sm },
    navCard: { padding: 0, overflow: "hidden" },
    navRow: {
      minHeight: theme.layout.touchTarget,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.md,
    },
    navTitle: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    navChevron: { fontSize: theme.fontSize.body, color: theme.color.textMuted },
    packingRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    packingBox: { fontSize: theme.fontSize.body, color: theme.color.textMuted },
    packingField: { flex: 1 },
    spotRow: { flexDirection: "row", alignItems: "flex-end", gap: theme.spacing.sm },
    spotRemove: { minWidth: 36, minHeight: theme.layout.touchTarget, alignItems: "center", justifyContent: "center" },
    packingRemove: { minWidth: 36, minHeight: 36, alignItems: "center", justifyContent: "center" },
    packingRemoveText: { fontSize: theme.fontSize.body, color: theme.color.textMuted },
    group: {
      gap: theme.spacing.sm,
    },
    groupTitle: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    muted: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    privacy: {
      padding: theme.spacing.sm,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.accent,
    },
    hint: {
      fontSize: theme.fontSize.small,
      color: theme.color.text,
    },
    error: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
    },
    footerError: {
      fontSize: theme.fontSize.small,
      color: theme.color.error,
      backgroundColor: theme.color.background,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.sm,
    },
  });
