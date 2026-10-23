import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DemoTools } from "../components/DemoTools";
import { AddressInput } from "../components/AddressInput";
import { OpenInMapsButton } from "../components/OpenInMapsButton";
import { SitterBadges } from "../components/SitterBadges";
import { ProfilePhotoGallery } from "../components/ProfilePhotoGallery";
import { SitterAnswersSummary } from "../components/SitterAnswersSummary";
import { Button } from "../components/ui/Button";
import { CheckRow } from "../components/ui/CheckRow";
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
import { AddressSuggestion, PinPlace, areaFromAddress, reverseGeocode } from "../lib/transit";
import { homeFor, useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";

type Draft = Record<string, string>;

type FieldSpec = { key: string; label: string; placeholder?: string; multiline?: boolean; numeric?: boolean };

const OWNER_FIELDS: FieldSpec[] = [
  { key: "home_address", label: "Home address", placeholder: "Shown only to a confirmed sitter" },
  { key: "emergency_contact_name", label: "Emergency contact name" },
  { key: "emergency_contact_phone", label: "Emergency contact phone" },
  { key: "vet_clinic_name", label: "Vet clinic" },
  { key: "vet_clinic_phone", label: "Vet clinic phone" },
];

const SITTER_FIELDS: FieldSpec[] = [
  { key: "bio", label: "About you", placeholder: "Shown to owners when they look for a sitter", multiline: true },
  { key: "service_area", label: "Service area", placeholder: "e.g. North York" },
  { key: "experience_years", label: "Years of experience", numeric: true },
  { key: "home_notes", label: "About your home", placeholder: "Yard, other pets, stairs…", multiline: true },
  { key: "home_address", label: "Home address", placeholder: "Shown only to owners with a confirmed booking" },
  { key: "visitor_parking", label: "Visitor parking", placeholder: "e.g. Spot B-12 behind the building" },
  { key: "lobby_notes", label: "Lobby / door notes", placeholder: "Buzz #1204, then left at the end of the hall", multiline: true },
  {
    key: "packing_list",
    label: "Packing list for owners",
    placeholder: "One item per line: food, bed, meds…",
    multiline: true,
  },
  {
    key: "policies",
    label: "House rules & policies",
    placeholder: "What's included, cancellation, house rules, pets you don't take… Written once; your replies draw on it.",
    multiline: true,
  },
];

const MAX_SPOTS = 3;

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

function packingListFromDraft(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
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
        setDraft(toDraft(result));
        setSpots(padSpots(result.fields.meet_spots));
        setSpotFields(Math.max(1, Math.min(MAX_SPOTS, result.fields.meet_spots.length)));
        setHome(
          result.fields.home_lat != null && result.fields.home_lng != null
            ? { lat: result.fields.home_lat, lng: result.fields.home_lng }
            : null,
        );
        setPlacedAddress(
          result.fields.home_address && result.fields.home_lat != null && result.fields.home_lng != null
            ? result.fields.home_address
            : null,
        );
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
        setDraft((prev) => ({ ...prev, home_address: place.address ?? "" }));
        setPlacedAddress(place.address);
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

  const fields = loaded.role === "owner" ? OWNER_FIELDS : SITTER_FIELDS;

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
    const packing = packingListFromDraft(draft.packing_list ?? "");
    // The address is required and has to be one that was found on the map (Check address, or the current location).
    const address = value("home_address");
    const pin = home;
    let pinNote: string | null = null;
    if (!address) found.home_address = "Add your home address.";
    else if (address !== placedAddress || !pin) found.home_address = "Check your address so it's on the map.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (pinFromGps && pin && homePlace) pinNote = `Pin saved near ${homePlace.label}`;
    const next: RoleProfile =
      loaded.role === "owner"
        ? {
            role: "owner",
            fields: {
              home_address: address,
              home_lat: pin?.lat ?? null,
              home_lng: pin?.lng ?? null,
              emergency_contact_name: value("emergency_contact_name"),
              emergency_contact_phone: value("emergency_contact_phone"),
              vet_clinic_name: value("vet_clinic_name"),
              vet_clinic_phone: value("vet_clinic_phone"),
              meet_spots: meetSpots,
            },
          }
        : {
            role: "sitter",
            fields: {
              bio: value("bio"),
              // Owners see only a rough place: the one typed, else the city and postal area of the checked address.
              service_area: value("service_area") ?? areaFromAddress(address),
              experience_years: experience ? Number(experience) : null,
              home_notes: value("home_notes"),
              home_address: address,
              home_lat: pin?.lat ?? null,
              home_lng: pin?.lng ?? null,
              services,
              meet_spots: meetSpots,
              visitor_parking: value("visitor_parking"),
              lobby_notes: value("lobby_notes"),
              packing_list: packing.length > 0 ? packing : [],
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
      if (router.canGoBack()) router.back();
      else router.replace(homeFor(profile.role));
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /** The person picked one of the real addresses: its text and its point become the home address and pin. */
  function pickSuggestion(suggestion: AddressSuggestion) {
    setDraft((prev) => ({ ...prev, home_address: suggestion.label }));
    setPlacedAddress(suggestion.label);
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
          ? "Location is off for Goldito in this browser. Allow it in the browser's site settings, or save your address to place the pin from it."
          : "We couldn't read your location. Try again, or save your address to place the pin from it.",
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
        <Text style={styles.muted}>
          {profile.role === "sitter"
            ? "A face and photos with pets. The first one is the cover owners see when they look for a sitter."
            : "Your sitter sees this once you book."}
        </Text>
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
      {fields.map((field) => (
        <View key={field.key} style={styles.fieldWithPin}>
          {field.key === "home_address" ? (
            <AddressInput
              label={field.label}
              value={draft[field.key] ?? ""}
              onChangeText={(text) => setDraft((prev) => ({ ...prev, [field.key]: text }))}
              placed={home ? placedAddress : null}
              onPick={pickSuggestion}
              placeholder={field.placeholder}
              error={errors[field.key]}
              testID="profile-home_address"
            />
          ) : (
            <TextField
              label={`${field.label} (optional)`}
              value={draft[field.key] ?? ""}
              onChangeText={(text) => setDraft((prev) => ({ ...prev, [field.key]: text }))}
              placeholder={field.placeholder}
              multiline={field.multiline}
              inputMode={field.numeric ? "numeric" : undefined}
              error={errors[field.key]}
              testID={`profile-${field.key}`}
            />
          )}
          {field.key === "home_address" ? (
            <View style={styles.group} testID="profile-home-pin">
              <Text style={styles.groupTitle}>Map pin for trips</Text>
              {/* Nothing about the pin shows until the person reads their location: an old saved pin (a demo seed, an
                  address from long ago) would only be a wrong place in the way. */}
              {locating || pinFromGps ? (
                <>
                  <Text style={[styles.muted, locating ? styles.pinBusy : styles.pinSet]} testID="profile-home-pin-status">
                    {locating
                      ? "📡 Reading your location… allow it in the browser if it asks."
                      : "✅ Pin set from your location. Tap Save to keep it."}
                  </Text>
                  {!locating && home ? (
                    <>
                      <Text style={styles.pinWhere} testID="profile-home-pin-where">
                        {homePlace
                          ? `📍 Near ${homePlace.label}${homePlace.postal ? ` · ${homePlace.postal}` : ""}`
                          : homePlace === undefined
                            ? "📍 Finding the neighbourhood…"
                            : "📍 We couldn't name this spot. Check it on the map"}
                      </Text>
                      <OpenInMapsButton
                        place={{ text: null, point: home }}
                        travelling={false}
                        style="link"
                        testID="profile-home-pin-map"
                      />
                      <Text style={styles.muted} testID="profile-home-pin-use">
                        {loaded.role === "owner"
                          ? "What it's for: the trip map and ETA when you or your sitter travel for a drop-off or pick-up, and finding sitters near you. It isn't shown to anyone as a point."
                          : "What it's for: the trip map and ETA to owners' homes, and so owners can find sitters near them. Owners only see a rounded distance (like “3 km”), never your pin or address."}
                      </Text>
                    </>
                  ) : null}
                </>
              ) : null}
              {homeNote ? (
                <Text style={styles.muted} testID="profile-home-pin-note">
                  {homeNote}
                </Text>
              ) : null}
              <TextButton
                label={locating ? "Locating…" : pinFromGps ? "Read my location again" : "Use my current location"}
                onPress={() => void useCurrentLocation()}
                disabled={locating}
                testID="profile-use-location"
              />
              <Text style={styles.muted}>Read once, only to mark your home. Nothing is tracked, and nobody sees the numbers.</Text>
            </View>
          ) : null}
        </View>
      ))}
      {loaded.role === "owner" ? (
        <View style={styles.group} testID="profile-entry-info">
          <Text style={styles.groupTitle}>Entry info for sitters</Text>
          <Text style={styles.muted}>
            Shown to your sitter 2 hours before they arrive.
          </Text>
          <TextButton
            label="Edit entry info"
            onPress={() => router.push("/owner/home-access")}
            testID="profile-home-access"
          />
        </View>
      ) : null}
      {loaded.role === "sitter" ? (
        <Text style={styles.muted} testID="profile-ai-notice">
          Goldito may use AI writing assistance to draft your replies and daily notes in your voice. You approve everything
          before it is sent.
        </Text>
      ) : null}
      {loaded.role === "sitter" ? (
        <View style={styles.group} testID="profile-ai-replies">
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
              ? "Replies that need nothing from you go out in your name after a short, human-paced delay. Anything that needs your confirmation waits for you."
              : "You read each drafted reply and tap Send. Nothing goes out without you."}
          </Text>
        </View>
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
      {loaded.role === "sitter" ? (
        <View style={styles.group} testID="profile-services">
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
            hint="One owner at a time, or several within your max."
            checked={multiOwner}
            onChange={setMultiOwner}
            testID="profile-multi-owner"
          />
        </View>
      ) : null}
      <View style={styles.group} testID="profile-spots">
        <Text style={styles.groupTitle}>Preferred meeting spots</Text>
        <Text style={styles.muted}>Up to 3 public places for a first Meet & Greet, never a home address.</Text>
        {spots.slice(0, spotFields).map((spot, i) => (
          <TextField
            key={i}
            label={`Spot ${i + 1}`}
            value={spot}
            onChangeText={(text) => setSpots((cur) => cur.map((s, k) => (k === i ? text : s)))}
            placeholder={i === 0 ? "e.g. Christie Pits, east entrance" : undefined}
            maxLength={60}
            testID={`profile-spot-${i + 1}`}
          />
        ))}
        {spotFields < MAX_SPOTS ? (
          <TextButton label="+ Add a spot" onPress={() => setSpotFields((n) => Math.min(MAX_SPOTS, n + 1))} style={styles.addSpot} testID="profile-add-spot" />
        ) : null}
      </View>
      <View style={styles.privacy}>
        <Text style={styles.hint}>
          {profile.role === "owner"
            ? "Your address and emergency contact are shared only with the sitter of a confirmed booking."
            : "Your home address and place notes are shared only with owners who have paid for a booking with you."}
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
    fieldWithPin: {
      gap: theme.spacing.md,
    },
    checkRow: { alignItems: "flex-start" },
    found: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.success },
    suggestions: { gap: theme.spacing.xs },
    suggestion: { alignSelf: "flex-start", paddingHorizontal: 0, minHeight: 36 },
    addSpot: { alignSelf: "flex-start", paddingHorizontal: 0 },
    group: {
      gap: theme.spacing.sm,
    },
    groupTitle: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    pinWhere: {
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.semibold,
      color: theme.color.text,
    },
    pinBusy: {
      color: theme.color.primary,
      fontWeight: theme.fontWeight.semibold,
    },
    pinSet: {
      color: theme.color.success,
      fontWeight: theme.fontWeight.semibold,
      backgroundColor: theme.color.successSurface,
      borderRadius: theme.radius.sm,
      padding: theme.spacing.sm,
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
