import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DemoTools } from "../components/DemoTools";
import { ShareLocationSheet } from "../components/ShareLocationSheet";
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
import { geocodeAddress } from "../lib/transit";
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
    placeholder: "One item per line — food, bed, meds…",
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

/** Role profile (phase-03 3.8). Settings + What's New are a separate screen in P1 (11.11). */
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
  const [services, setServices] = useState<Service[]>(["boarding"]);
  const [multiOwner, setMultiOwner] = useState(false);
  const [aiMode, setAiMode] = useState<AiReplyMode>({ mode: "manual", consented: false });
  const [consenting, setConsenting] = useState(false);
  const [home, setHome] = useState<LatLng | null>(null);
  // The pin came from "Use my current location" this visit: an address typed later must not replace it.
  const [pinFromGps, setPinFromGps] = useState(false);
  const [askingLocation, setAskingLocation] = useState(false);
  const [locating, setLocating] = useState(false);
  const [homeNote, setHomeNote] = useState<string | null>(null);

  const profile = session.status === "signedIn" ? session.profile : null;

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    loadRoleProfile(profile.id, profile.role)
      .then((result) => {
        setLoaded(result);
        setDraft(toDraft(result));
        setSpots(padSpots(result.fields.meet_spots));
        setHome(
          result.fields.home_lat != null && result.fields.home_lng != null
            ? { lat: result.fields.home_lat, lng: result.fields.home_lng }
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
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const value = (key: string) => {
      const trimmed = (draft[key] ?? "").trim();
      return trimmed === "" ? null : trimmed;
    };
    const packing = packingListFromDraft(draft.packing_list ?? "");
    // The map pin follows the address: a new address is looked up (unless the pin was just set from the phone's
    // location); one that can't be placed clears the old pin, which belonged to the old address.
    const address = value("home_address");
    let pin = home;
    let pinNote: string | null = null;
    if (address && address !== (loaded.fields.home_address ?? null) && !pinFromGps) {
      setSaving(true);
      const placed = await geocodeAddress(address);
      if (placed.found) {
        pin = placed.point;
        pinNote = placed.label ? `Pin placed near ${placed.label}` : "Pin placed from your address";
      } else {
        pin = null;
        pinNote = "We couldn't place that address on the map — use your current location for the pin";
      }
    }
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
              service_area: value("service_area"),
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
      toast.show(pinNote ? `Profile saved ✅ · ${pinNote}` : "Profile saved ✅");
      if (router.canGoBack()) router.back();
      else router.replace(homeFor(profile.role));
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function useCurrentLocation() {
    setLocating(true);
    setHomeNote(null);
    try {
      setHome(await getCurrentPosition());
      setPinFromGps(true);
      setAskingLocation(false);
      setHomeNote("Pin set from your location — Save to keep it.");
    } catch (error) {
      setAskingLocation(false);
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
    <Screen contentStyle={styles.content}>
      <Text style={styles.role}>{profile.role === "owner" ? "Pet owner" : "Pet sitter"}</Text>
      <TextField
        label="Your name"
        value={displayName}
        onChangeText={setDisplayName}
        error={errors.display_name}
        testID="profile-display_name"
      />
      {fields.map((field) => (
        <View key={field.key} style={styles.fieldWithPin}>
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
          {field.key === "home_address" ? (
            <View style={styles.group} testID="profile-home-pin">
              <Text style={styles.groupTitle}>Map pin for trips</Text>
              <Text style={styles.muted} testID="profile-home-pin-status">
                {home
                  ? "📍 Pin saved. Live trips to or from your home can show a map and an ETA."
                  : "No pin yet. Save your address to place one, or use your current location while you're home."}
              </Text>
              {homeNote ? (
                <Text style={styles.muted} testID="profile-home-pin-note">
                  {homeNote}
                </Text>
              ) : null}
              <TextButton
                label={locating ? "Locating…" : "Use my current location"}
                onPress={() => setAskingLocation(true)}
                disabled={locating}
                testID="profile-use-location"
              />
            </View>
          ) : null}
        </View>
      ))}
      <ShareLocationSheet
        visible={askingLocation}
        title="Use your current location as your home pin?"
        lines={[
          "Goldito reads your location once, right now.",
          "It only marks your home on the map for trips — nothing is tracked, and nobody sees the numbers.",
          "Do this while you're at home, so the pin is in the right place.",
        ]}
        allowLabel="Use my location"
        onAllow={() => void useCurrentLocation()}
        onDecline={() => setAskingLocation(false)}
        busy={locating}
        testID="home-location-sheet"
      />
      {loaded.role === "owner" ? (
        <View style={styles.group} testID="profile-entry-info">
          <Text style={styles.groupTitle}>Entry info for sitters</Text>
          <Text style={styles.muted}>
            Lockbox, buzzer, and steps — shown only from 2 hours before they arrive at your place.
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
            hint="Off: one owner's pets at a time — other owners can't book dates that are on hold or booked. On: several owners, within your max pets."
            checked={multiOwner}
            onChange={setMultiOwner}
            testID="profile-multi-owner"
          />
        </View>
      ) : null}
      <View style={styles.group} testID="profile-spots">
        <Text style={styles.groupTitle}>Preferred meeting spots (optional)</Text>
        <Text style={styles.muted}>
          Up to 3 public places for a first Meet & Greet — a park gate or a café, never a home address.
        </Text>
        {spots.map((spot, i) => (
          <TextField
            key={i}
            label={`Spot ${i + 1}`}
            value={spot}
            onChangeText={(text) => setSpots((cur) => cur.map((s, k) => (k === i ? text : s)))}
            placeholder={i === 0 ? "e.g. Christie Pits — east entrance" : undefined}
            maxLength={60}
            testID={`profile-spot-${i + 1}`}
          />
        ))}
      </View>
      <View style={styles.privacy}>
        <Text style={styles.hint}>
          {profile.role === "owner"
            ? "Your address and emergency contact are shared only with the sitter of a confirmed booking."
            : "Your home address and place notes are shared only with owners who have paid for a booking with you."}
        </Text>
      </View>
      {saveError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {saveError}
        </Text>
      ) : null}
      <Button label={saving ? "Saving…" : "Save"} onPress={() => void save()} disabled={saving} testID="profile-save" />
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
      fontWeight: "600",
      color: theme.color.textMuted,
      textTransform: "uppercase",
    },
    fieldWithPin: {
      gap: theme.spacing.md,
    },
    group: {
      gap: theme.spacing.sm,
    },
    groupTitle: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
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
  });
