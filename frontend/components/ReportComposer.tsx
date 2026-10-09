import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import {
  CUSTOM_CHIP_MAX,
  ChipPhoto,
  REPORT_BODY_MAX,
  REPORT_MAX_HIGHLIGHTS,
  REPORT_MAX_PHOTOS,
  ReportChip,
  ReportDraft,
  generateReport,
  overrideLabel,
  getTodayReport,
  sendReport,
  suggestChips,
  summaryLine,
  type DaySummary,
} from "../features/diary/reportApi";
import { CHECKIN_GROUPS } from "../features/care/checkinOptions";
import { appToday } from "../features/schedule/dates";
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
import { Sheet } from "./ui/Sheet";
import { Card } from "./ui/Card";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";

type Photo = { mediaId: string; thumbUrl: string };

/** Which highlights go first when more than REPORT_MAX_HIGHLIGHTS are on (by chip source). */
const HIGHLIGHT_ORDER: Record<string, number> = { custom: 0, checkin: 1, vision: 2, feed: 3 };

/**
 * The sitter's evening note for one pet (phase-07 7.3): chips from the day (and up to two photos) →
 * keep or turn off → optional short lines of their own (each becomes a chip, FB-18) → Generate → edit the
 * preview → Send. Nothing reaches the owner
 * before Send; the owner only ever sees the text the sitter sent (D36 · D38).
 */
/** Where this pet's report stands, for the Diary's pet picker. */
export type ReportStatus = "sent" | "draft" | null;

export function ReportComposer({ pet, onStatus }: { pet: CaringPet; onStatus?: (status: ReportStatus) => void }) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const { profile } = useSession();
  const sitterId = profile?.id;

  const [loading, setLoading] = useState(true);
  const [chips, setChips] = useState<ReportChip[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  /** Values the sitter corrected on a record chip: { meal: "most" }. */
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [descriptions, setDescriptions] = useState<ChipPhoto[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<Photo[]>([]);
  /** Short lines the sitter typed ("Anything to add?"): each is a chip of their own, like an episode chip. */
  const [custom, setCustom] = useState<ReportChip[]>([]);
  const [customText, setCustomText] = useState("");
  const customSeq = useRef(0);
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
        setSummary(res.summary);
        setDescriptions(res.photos);
      } catch (e) {
        toast.show((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [pet.id, toast],
  );

  /** Today's saved report (draft or sent), then today's chips. */
  const loadToday = useCallback(
    async (isLive: () => boolean) => {
      try {
        const existing = sitterId ? await getTodayReport(pet.id, sitterId) : null;
        if (!isLive()) return;
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
      if (!isLive()) return;
      setLoading(false);
      void refreshChips([]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pet.id, sitterId],
  );

  useEffect(() => {
    let cancelled = false;
    void loadToday(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadToday]);

  // The Diary tab stays mounted: coming back to it must show what was recorded meanwhile (M-12). The day's record
  // and note chips are read again quietly (the photo chips stay — no new vision call); what the sitter turned off
  // or added stays, by chip id. A new day starts over.
  const day = useRef(appToday());
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false; // the mount already loaded
        return;
      }
      let live = true;
      if (appToday() !== day.current) {
        day.current = appToday();
        setDraft(null);
        setSent(false);
        setBody("");
        setOff(new Set());
        setCustom([]);
        setOverrides({});
        setPhotos([]);
        setDescriptions([]);
        setChips([]);
        void loadToday(() => live);
      } else {
        suggestChips(pet.id, [])
          .then((res) => {
            if (!live) return;
            setChips((prev) => [...res.chips, ...prev.filter((c) => c.source === "vision")]);
            setSummary(res.summary);
          })
          .catch(() => undefined); // a quiet refresh: the chips on screen stay
      }
      return () => {
        live = false;
      };
    }, [loadToday, pet.id]),
  );

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

  // A corrected record chip shows (and is sent) with the sitter's value.
  const shown = useMemo(
    () =>
      chips.map((c) => {
        const fixed = c.check && overrides[c.check] ? overrideLabel(c.check, overrides[c.check]) : null;
        return fixed ? { ...c, label: fixed } : c;
      }),
    [chips, overrides],
  );
  const editable = useMemo(
    () => chips.filter((c) => c.kind === "record" && c.check && CHECKIN_GROUPS.some((g) => g.kind === c.check)),
    [chips],
  );
  const all = useMemo(() => [...shown, ...custom], [shown, custom]);
  const kept = useMemo(() => all.filter((c) => !off.has(c.id)), [all, off]);
  // The report uses the first REPORT_MAX_HIGHLIGHTS: what the sitter wrote, then notes, photos, the feed.
  const highlights = useMemo(
    () => kept.filter((c) => c.kind === "episode").sort((a, b) => (HIGHLIGHT_ORDER[a.source] ?? 9) - (HIGHLIGHT_ORDER[b.source] ?? 9)),
    [kept],
  );

  const addCustom = () => {
    const label = customText.trim().replace(/\s+/g, " ").slice(0, CUSTOM_CHIP_MAX);
    if (!label) return;
    if (!all.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      const id = `custom-${(customSeq.current += 1)}`;
      setCustom((prev) => [...prev, { id, kind: "episode", label, source: "custom", check: null, media_id: null }]);
    }
    setCustomText("");
  };

  /** A line the sitter added can be taken back entirely (FB-17); suggested chips are only turned off. */
  const removeCustom = (id: string) => {
    setCustom((prev) => prev.filter((c) => c.id !== id));
    setOff((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  useEffect(() => {
    onStatus?.(sent ? "sent" : draft ? "draft" : null);
  }, [sent, draft, onStatus]);

  const generate = async () => {
    if (busy) return;
    setBusy("generate");
    try {
      const skip = chips.filter((c) => c.kind === "record" && c.check && off.has(c.id)).map((c) => c.check as string);
      const result = await generateReport({
        petId: pet.id,
        chips: highlights.map((c) => c.label),
        // The sitter's own words now come as lines (custom chips, FB-18); no separate note.
        note: null,
        // A photo with any chip turned off sends no description: it could say what that chip said (D38).
        photos: descriptions
          .filter((d) => !chips.some((c) => c.media_id === d.media_id && off.has(c.id)))
          .map((d) => d.description),
        skip: [...new Set(skip)],
        // Turned-off episode chips of the day's notes and photos: the server leaves those records out.
        off: [...off].filter((id) => id.startsWith("note-") || id.startsWith("feed-")),
        // Only for chips still on: a corrected value of a switched-off check never goes out.
        overrides: Object.fromEntries(Object.entries(overrides).filter(([check]) => !skip.includes(check))),
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

  /** Another report the same day (FB-22): fresh chips from what happened since the last one went out. */
  const writeAnother = () => {
    setSent(false);
    setBody("");
    setOff(new Set());
    setCustom([]);
    setOverrides({});
    setPhotos([]);
    setDescriptions([]);
    setChips([]);
    void refreshChips([]);
  };

  if (sent) {
    return (
      <Card style={styles.card} testID={`report-${pet.id}`}>
        <Text style={styles.title}>{pet.name}</Text>
        <Text style={styles.sentBadge} testID={`report-sent-${pet.id}`}>{`Sent to ${pet.ownerName} ✓`}</Text>
        <Text style={styles.body}>{body}</Text>
        <Button label="✏️ Write another report" variant="secondary" onPress={writeAnother} testID={`report-another-${pet.id}`} />
        <Text style={styles.muted}>It covers what happens from now on.</Text>
      </Card>
    );
  }

  if (draft) {
    return (
      <Card style={styles.card} testID={`report-${pet.id}`}>
        <Text style={styles.title}>{`${pet.name} · preview`}</Text>
        {draft.fallback ? (
          <Text style={styles.muted} testID={`report-fallback-${pet.id}`}>
            The writing helper is down — here's a plain list. Edit it if you like, then send.
          </Text>
        ) : null}
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
      {summary ? (
        <Text style={styles.muted} testID={`report-summary-${pet.id}`}>
          {summaryLine(summary)}
        </Text>
      ) : null}
      <Text style={styles.label}>Today's chips</Text>
      {all.length > 0 ? (
        <>
          <ChipSuggestions chips={all} off={off} onToggle={toggle} onRemove={removeCustom} testIDPrefix={`report-chip-${pet.id}`} />
          {highlights.length > REPORT_MAX_HIGHLIGHTS ? (
            <Text style={styles.muted} testID={`report-too-many-${pet.id}`}>
              {`Only ${REPORT_MAX_HIGHLIGHTS} highlights go into the report — turn a few off to choose.`}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.muted} testID={`report-nochips-${pet.id}`}>
          {busy === "chips" ? "Looking at today…" : "Nothing recorded yet — add a photo or a short line below."}
        </Text>
      )}

      {editable.length > 0 ? (
        <TextButton label="✎ Fix a recorded value" onPress={() => setEditing(true)} testID={`report-edit-${pet.id}`} />
      ) : null}
      <Sheet visible={editing} title="Fix a recorded value" onClose={() => setEditing(false)} testID={`report-edit-sheet-${pet.id}`}>
        {editable.map((chip) => {
          const group = CHECKIN_GROUPS.find((g) => g.kind === chip.check);
          if (!group) return null;
          const current = overrides[group.kind] ?? chip.value ?? null;
          return (
            <View key={chip.id} style={styles.editGroup}>
              <Text style={styles.label}>{`${group.emoji} ${group.label}`}</Text>
              <View style={styles.editPills}>
                {group.options.map((o) => {
                  const on = current === o.value;
                  return (
                    <Button
                      key={o.value}
                      label={on ? `✓ ${o.label}` : o.label}
                      variant={on ? "primary" : "secondary"}
                      onPress={() =>
                        setOverrides((prev) => {
                          const next = { ...prev };
                          if (o.value === chip.value) delete next[group.kind];
                          else next[group.kind] = o.value;
                          return next;
                        })
                      }
                      testID={`report-edit-${pet.id}-${group.kind}-${o.value}`}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}
        <Button label="Done" onPress={() => setEditing(false)} testID={`report-edit-done-${pet.id}`} />
      </Sheet>

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

      <View style={styles.addRow}>
        <View style={styles.addField}>
          <TextField
            label="Anything to add? One short line at a time"
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
    editGroup: { gap: theme.spacing.xs },
    editPills: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    addRow: { flexDirection: "row", alignItems: "flex-end", gap: theme.spacing.sm },
    addField: { flex: 1 },
    photos: { flexDirection: "row", gap: theme.spacing.sm },
    photoBox: { alignItems: "center", gap: 2 },
    photo: { width: 72, height: 72, borderRadius: theme.radius.sm, backgroundColor: theme.color.border },
  });
