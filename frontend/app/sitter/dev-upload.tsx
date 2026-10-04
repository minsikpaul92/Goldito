import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, Text } from "react-native";

import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingView } from "../../components/ui/LoadingView";
import { Screen } from "../../components/ui/Screen";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { MediaPurpose, UploadError, UploadMediaResult, uploadMedia } from "../../lib/cloudinary";
import { MediaKind, PickedMedia, pickMedia } from "../../lib/media";
import { getSupabase } from "../../lib/supabase";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";

/**
 * Dev screen for phase 04: pick → (trim) → upload → saved. Removed in Phase 05 when the real
 * feed upload exists. Open it at /sitter/dev-upload (needs EXPO_PUBLIC_DEV_ROUTES=1).
 */
const devRoutesEnabled = process.env.EXPO_PUBLIC_DEV_ROUTES === "1";

type PetRow = { id: string; name: string; species: string };

const PURPOSES: { value: Exclude<MediaPurpose, "handoff">; label: string }[] = [
  { value: "feed", label: "Feed" },
  { value: "task_proof", label: "Task" },
  { value: "report", label: "Report" },
  { value: "safety_label", label: "Label" },
];

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "done"; result: UploadMediaResult; isVideo: boolean }
  | { kind: "error"; message: string; step: string };

export default function DevUpload() {
  if (!devRoutesEnabled) return <Redirect href="/" />;
  return <DevUploadScreen />;
}

function DevUploadScreen() {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const [pets, setPets] = useState<PetRow[] | null>(null);
  const [petId, setPetId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<Exclude<MediaPurpose, "handoff">>("feed");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [last, setLast] = useState<{ picked: PickedMedia; kind: MediaKind } | null>(null);

  useEffect(() => {
    let alive = true;
    getSupabase()
      .from("pets")
      .select("id, name, species")
      .order("name")
      .then(({ data }) => {
        if (!alive) return;
        const rows = (data ?? []) as PetRow[];
        setPets(rows);
        setPetId((current) => current ?? rows[0]?.id ?? null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const upload = useCallback(
    async (picked: PickedMedia, kind: MediaKind) => {
      if (!petId) return;
      setStatus({ kind: "uploading" });
      try {
        const result = await uploadMedia({
          petId,
          purpose,
          file: picked.file,
          trim: picked.trim,
          resourceType: kind,
        });
        setStatus({ kind: "done", result, isVideo: kind === "video" });
        toast.show("Uploaded ✅");
      } catch (err) {
        const step = err instanceof UploadError ? err.step : "upload";
        const message = err instanceof Error ? err.message : "Upload failed.";
        setStatus({ kind: "error", message, step });
      }
    },
    [petId, purpose, toast],
  );

  const pick = async (kind: MediaKind) => {
    const picked = await pickMedia({ purpose, mediaTypes: [kind] });
    if (!picked) return;
    setLast({ picked, kind });
    await upload(picked, kind);
  };

  if (pets === null) return <LoadingView />;
  if (pets.length === 0) {
    return (
      <Screen>
        <EmptyState
          emoji="🐾"
          title="No pets to upload for"
          message="Pets show up here once an owner books you."
        />
      </Screen>
    );
  }

  const busy = status.kind === "uploading";
  const petOptions = pets.slice(0, 4).map((pet) => ({ value: pet.id, label: pet.name }));

  return (
    <Screen contentStyle={styles.content}>
      <Text style={styles.note}>Upload test for Phase 04 — removed in Phase 05.</Text>

      {petOptions.length > 1 ? (
        <SegmentedControl options={petOptions} value={petId} onChange={setPetId} testID="dev-pet" />
      ) : null}
      <SegmentedControl options={PURPOSES} value={purpose} onChange={setPurpose} testID="dev-purpose" />

      <Button label="Pick photo" onPress={() => pick("image")} disabled={busy} testID="dev-pick-photo" />
      <Button
        label="Pick video"
        onPress={() => pick("video")}
        disabled={busy}
        variant="secondary"
        testID="dev-pick-video"
      />

      {status.kind === "uploading" ? (
        <Text style={styles.note} testID="dev-status">
          Uploading…
        </Text>
      ) : null}

      {status.kind === "error" ? (
        <Card>
          <Text style={styles.error} testID="dev-error">
            {status.message}
          </Text>
          <Text style={styles.note}>Failed at: {status.step}</Text>
          {last ? (
            <Button label="Retry" onPress={() => upload(last.picked, last.kind)} testID="dev-retry" />
          ) : null}
        </Card>
      ) : null}

      {status.kind === "done" ? (
        <Card>
          <Text style={styles.success} testID="dev-done">
            Saved ✅
          </Text>
          {!status.isVideo && status.result.thumbUrl ? (
            <Image source={{ uri: status.result.thumbUrl }} style={styles.thumb} resizeMode="cover" />
          ) : null}
          <Text style={styles.note} selectable testID="dev-media-id">
            media {status.result.mediaId}
          </Text>
          <Text style={styles.note} selectable numberOfLines={2}>
            {status.result.secureUrl}
          </Text>
        </Card>
      ) : null}

    </Screen>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.md,
    },
    note: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
    },
    error: {
      fontSize: theme.fontSize.body,
      color: theme.color.error,
    },
    success: {
      fontSize: theme.fontSize.body,
      fontWeight: "600",
      color: theme.color.success,
    },
    thumb: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: theme.radius.md,
      marginVertical: theme.spacing.sm,
      backgroundColor: theme.color.accent,
    },
  });
