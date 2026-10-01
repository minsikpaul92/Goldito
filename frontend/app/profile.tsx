import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingView } from "../components/ui/LoadingView";
import { Screen } from "../components/ui/Screen";
import { TextField } from "../components/ui/TextField";
import { RoleProfile, loadRoleProfile, saveProfile } from "../features/profile/profileApi";
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
];

function toDraft(profile: RoleProfile): Draft {
  return Object.fromEntries(
    Object.entries(profile.fields).map(([key, value]) => [key, value == null ? "" : String(value)]),
  );
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

  const profile = session.status === "signedIn" ? session.profile : null;

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName);
    loadRoleProfile(profile.id, profile.role)
      .then((result) => {
        setLoaded(result);
        setDraft(toDraft(result));
      })
      .catch((error: Error) => setLoadError(error.message));
    // Load once per user; later name edits are local until saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role]);

  if (session.status === "loading") return <LoadingView />;
  if (!profile) return <Redirect href="/login" />;
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
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const value = (key: string) => {
      const trimmed = (draft[key] ?? "").trim();
      return trimmed === "" ? null : trimmed;
    };
    const next: RoleProfile =
      loaded.role === "owner"
        ? {
            role: "owner",
            fields: {
              home_address: value("home_address"),
              emergency_contact_name: value("emergency_contact_name"),
              emergency_contact_phone: value("emergency_contact_phone"),
              vet_clinic_name: value("vet_clinic_name"),
              vet_clinic_phone: value("vet_clinic_phone"),
            },
          }
        : {
            role: "sitter",
            fields: {
              bio: value("bio"),
              service_area: value("service_area"),
              experience_years: experience ? Number(experience) : null,
              home_notes: value("home_notes"),
              home_address: value("home_address"),
            },
          };

    setSaving(true);
    setSaveError(null);
    try {
      await saveProfile(profile.id, name, next);
      session.patchProfile({ displayName: name });
      setLoaded(next);
      toast.show("Profile saved ✅");
      if (router.canGoBack()) router.back();
      else router.replace(homeFor(profile.role));
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
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
        <TextField
          key={field.key}
          label={`${field.label} (optional)`}
          value={draft[field.key] ?? ""}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, [field.key]: text }))}
          placeholder={field.placeholder}
          multiline={field.multiline}
          inputMode={field.numeric ? "numeric" : undefined}
          error={errors[field.key]}
          testID={`profile-${field.key}`}
        />
      ))}
      <View style={styles.privacy}>
        <Text style={styles.hint}>
          {profile.role === "owner"
            ? "Your address and emergency contact are shared only with the sitter of a confirmed booking."
            : "Your home address is shared only with owners who have a confirmed booking with you."}
        </Text>
      </View>
      {saveError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {saveError}
        </Text>
      ) : null}
      <Button label={saving ? "Saving…" : "Save"} onPress={() => void save()} disabled={saving} testID="profile-save" />
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
