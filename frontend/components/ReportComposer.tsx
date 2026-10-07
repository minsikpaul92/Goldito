import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import {
  CUSTOM_CHIP_MAX,
  ChipPhoto,
  REPORT_BODY_MAX,
  REPORT_MAX_PHOTOS,
  REPORT_NOTE_MAX,
  ReportChip,
  ReportDraft,
  generateReport,
  getTodayReport,
  sendReport,
  suggestChips,
} from "../features/diary/reportApi";
import { UploadError, uploadMedia } from "../lib/cloudinary";
import { pickMedia } from "../lib/media";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useSession } from "../providers/SessionProvider";
import { useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import type { CaringPet } from "../features/feed/caringPets";
import { ChipSuggestions } from "./ChipSuggestions";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";

type Photo = { mediaId: string; thumbUrl: string };

/**
 * The sitter's evening note for one pet (phase-07 7.3): chips from the day (and up to two photos) →
 * keep or turn off → optional short note → Generate → edit the preview → Send. Nothing reaches the owner
 * before Send; the owner only ever sees the text the sitter sent (D36 · D38).
 */
export function ReportComposer({ pet }: { pet: CaringPet }) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const { profile } = useSession();
  const sitterId = profile?.id;

  const [loading, setLoading] = useState(true);
  const [chips, setChips] = useState<ReportChip[]>([]);
  const [descriptions, setDescriptions] = useState<ChipPhoto[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [note, setNote] = useState("");
  /** Chips the sitter typed themselves ("+ Add"); they behave like episode chips. */
  const [custom, setCustom] = useState<ReportChip[]>([]);
  const [adding, setAdding] = useState(false);
  const [customText, setCustomText] = useState("");
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"chips" | "generate" | "send" | null>(null);
  const [sent, setSent] = useState(false);

  const refreshChips = useCallback(
    async (mediaIds: string[]) => {
      setBusy("chips");
      try {
        const res = await suggestChips(pet.id, mediaIds);
        setChips(res.chips);
        setDescriptions(res.photos);
      } catch (e) {
        toast.show((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [pet.id, toast],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = sitterId ? await getTodayReport(pet.id, sitterId) : null;
        if (cancelled) return;
        if (existing?.status === "sent") {
          setSent(true);
          setBody(existing.body);
        } else if (existing) {
          setDraft(existing);
          setBody(existing.body);
        }
      } catch {
        // No saved draft is fine: the sitter starts from the chips.
      }
      if (!cancelled) setLoading(false);
      if (!cancelled) void refreshChips([]);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet.id, sitterId]);

  const toggle = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addPhoto = async () => {
    if (busy || photos.length >= REPORT_MAX_PHOTOS) return;
    const picked = await pickMedia({ purpose: "report", confirm: true, confirmLabel: "Use this photo" });
    if (!picked) return;
    setBusy("chips");
    try {
      const up = await uploadMedia({ petId: pet.id, purpose: "report", file: picked.file, resourceType: "image" });
      const next = [...photos, { mediaId: up.mediaId, thumbUrl: up.thumbUrl }];
      setPhotos(next);
      await refreshChips(next.map((p) => p.mediaId));
    } catch (e) {
      setBusy(null);
      errorDialog.show({
        title: "Photo not added",
        message: e instanceof UploadError || e instanceof Error ? e.message : "Try again.",
      });
    }
  };

  const removePhoto = (mediaId: string) => {
    const next = photos.filter((p) => p.mediaId !== mediaId);
    setPhotos(next);
    void refreshChips(next.map((p) => p.mediaId));
  };

  const all = useMemo(() => [...chips, ...custom], [chips, custom]);
  const kept = useMemo(() => all.filter((c) => !off.has(c.id)), [all, off]);

  const addCustom = () => {
    const label = customText.trim().replace(/\s+/g, " ").slice(0, CUSTOM_CHIP_MAX);
    if (!label) return;
    if (!all.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      setCustom((prev) => [...prev, { id: `custom-${prev.length}-${label}`, kind: "episode", label, source: "custom", check: null, media_id: null }]);
    }
    setCustomText("");
    setAdding(false);
  };

  const generate = async () => {
    if (busy) return;
    setBusy("generate");
    try {
      const skip = chips.filter((c) => c.kind === "record" && c.check && off.has(c.id)).map((c) => c.check as string);
      const keptPhotoIds = new Set(kept.filter((c) => c.source === "vision").map((c) => c.media_id));
      const result = await generateReport({
        petId: pet.id,
        chips: kept.filter((c) => c.kind === "episode").map((c) => c.label),
        note: note.trim() || null,
        // A photo whose chips were all turned off stays out of the report too (D38).
        photos: descriptions
          .filter((d) => keptPhotoIds.has(d.media_id) || !chips.some((c) => c.media_id === d.media_id))
          .map((d) => d.description),
        skip: [...new Set(skip)],
      });
      setDraft(result);
      setBody(result.body);
    } catch (e) {
      errorDialog.show({ title: "Couldn't write the report", message: (e as Error).message, onRetry: () => void generate() });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!draft || busy) return;
    setBusy("send");
    try {
      await sendReport(draft.id, body.trim());
      setSent(true);
      setDraft(null);
      toast.show(`Sent ✅ ${pet.ownerName} was told`);
    } catch (e) {
      errorDialog.show({ title: "Not sent", message: (e as Error).message, onRetry: () => void send() });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Card testID={`report-${pet.id}`}>
        <Text style={styles.title}>{pet.name}</Text>
        <Text style={styles.muted}>Loading…</Text>
      </Card>
    );
  }

  if (sent) {
    return (
      <Card style={styles.card} testID={`report-${pet.id}`}>
        <Text style={styles.title}>{pet.name}</Text>
        <Text style={styles.sentBadge} testID={`report-sent-${pet.id}`}>{`Sent to ${pet.ownerName} ✓`}</Text>
        <Text style={styles.body}>{body}</Text>
      </Card>
    );
  }

  if (draft) {
    return (
      <Card style={styles.card} testID={`report-${pet.id}`}>
        <Text style={styles.title}>{`${pet.name} · preview`}</Text>
        <Text style={styles.muted}>{`Edit it if you like. ${pet.ownerName} sees it only after you send.`}</Text>
        <TextField
          label="Daily report"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={REPORT_BODY_MAX}
          testID={`report-body-${pet.id}`}
        />
        <Button
          label={busy === "send" ? "Sending…" : `Send to ${pet.ownerName}`}
          disabled={busy != null || !body.trim()}
          onPress={() => void send()}
          testID={`report-send-${pet.id}`}
        />
        <TextButton label="Back to chips" onPress={() => setDraft(null)} testID={`report-back-${pet.id}`} />
      </Card>
    );
  }

  return (
    <Card style={styles.card} testID={`report-${pet.id}`}>
      <Text style={styles.title}>{pet.name}</Text>
      <Text style={styles.label}>Today's chips</Text>
      {all.length > 0 ? (
        <ChipSuggestions chips={all} off={off} onToggle={toggle} testIDPrefix={`report-chip-${pet.id}`} />
      ) : (
        <Text style={styles.muted} testID={`report-nochips-${pet.id}`}>
          {busy === "chips" ? "Looking at today…" : "Nothing recorded yet — add a photo or a short note."}
        </Text>
      )}

      {adding ? (
        <View style={styles.addRow}>
          <View style={styles.addField}>
            <TextField
              label="Your own chip"
              value={customText}
              maxLength={CUSTOM_CHIP_MAX}
              placeholder="e.g. Learned a new trick"
              onChangeText={setCustomText}
              onSubmitEditing={addCustom}
              testID={`report-custom-input-${pet.id}`}
            />
          </View>
          <Button label="Add" disabled={!customText.trim()} onPress={addCustom} testID={`report-custom-add-${pet.id}`} />
        </View>
      ) : (
        <TextButton label="+ Add" onPress={() => setAdding(true)} testID={`report-custom-${pet.id}`} />
      )}

      <View style={styles.photos}>
        {photos.map((p) => (
          <View key={p.mediaId} style={styles.photoBox}>
            <Image source={{ uri: p.thumbUrl }} style={styles.photo} accessibilityIgnoresInvertColors />
            <TextButton label="Remove" onPress={() => removePhoto(p.mediaId)} testID={`report-photo-remove-${p.mediaId}`} />
          </View>
        ))}
      </View>
      <Button
        label={photos.length >= REPORT_MAX_PHOTOS ? "📷 2 photos added" : `📷 Add photo (${photos.length}/${REPORT_MAX_PHOTOS})`}
        variant="secondary"
        disabled={busy != null || photos.length >= REPORT_MAX_PHOTOS}
        onPress={() => void addPhoto()}
        testID={`report-add-photo-${pet.id}`}
      />

      <TextField
        label="Anything to add? (optional)"
        value={note}
        maxLength={REPORT_NOTE_MAX}
        placeholder="A short note, in your words"
        onChangeText={setNote}
        testID={`report-note-${pet.id}`}
      />
      <Button
        label={busy === "generate" ? "Writing…" : "Write the report"}
        disabled={busy != null}
        onPress={() => void generate()}
        testID={`report-generate-${pet.id}`}
      />
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.sm },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    label: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    sentBadge: { fontSize: theme.fontSize.small, fontWeight: "700", color: theme.color.primary },
    addRow: { flexDirection: "row", alignItems: "flex-end", gap: theme.spacing.sm },
    addField: { flex: 1 },
    photos: { flexDirection: "row", gap: theme.spacing.sm },
    photoBox: { alignItems: "center", gap: 2 },
    photo: { width: 72, height: 72, borderRadius: theme.radius.sm, backgroundColor: theme.color.border },
  });
