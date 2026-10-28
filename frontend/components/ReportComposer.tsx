import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  CUSTOM_CHIP_MAX,
  ChipPhoto,
  REPORT_BODY_MAX,
  REPORT_MAX_HIGHLIGHTS,
  ReportChip,
  ReportDraft,
  generateReport,
  saveDraftByHand,
  overrideLabel,
  getTodayReport,
  sendReport,
  suggestChips,
  setDiaryPagePhotos,
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
import { PageActions } from "../features/diary/PageActions";
import { type DecorItem, saveDecor } from "../features/snap/decorApi";
import { DecoratedReport } from "../features/snap/DecoratedReport";
import { ChipSuggestions } from "./ChipSuggestions";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";
import { Card } from "./ui/Card";
import { TextButton } from "./ui/TextButton";
import { Tag } from "./ui/Tag";
import { TextField } from "./ui/TextField";

type Photo = { mediaId: string; thumbUrl: string };
/** The most photos on a page (015x). */
const MAX_PAGE_PHOTOS = 4;

/** Which highlights go first when more than REPORT_MAX_HIGHLIGHTS are on (by chip source). */
const HIGHLIGHT_ORDER: Record<string, number> = { custom: 0, checkin: 1, vision: 2, feed: 3 };

/** Where this pet's report stands, for the Diary's pet picker. */
export type ReportStatus = "sent" | "draft" | null;

/** The Send button the Diary pins at the bottom of the screen (#398), or null when there is nothing to send. */
export type SendBar = { label: string; disabled: boolean; onPress: () => void };

/**
 * The sitter's evening note for one pet (phase-07 7.3), as a diary page from the start (Diary book): write on the page
 * by hand, or let Goldito write it from the day's chips (keep or turn off, a photo from the page's picture box, short
 * lines of their own, FB-18) and edit it there, then Send. Nothing reaches the owner before Send; the owner only ever
 * sees the text the sitter sent (D36 · D38). Layout (#398): the page, then "Write the page from the chips" right
 * under it, then the chips; Send is pinned by the Diary screen (`onSendBar`).
 */
export function ReportComposer({
  pet,
  onStatus,
  onSendBar,
}: {
  pet: CaringPet;
  onStatus?: (status: ReportStatus) => void;
  onSendBar?: (bar: SendBar | null) => void;
}) {
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
  /** The line box is hidden behind "+ Add a line" until the sitter wants it. */
  const [customOpen, setCustomOpen] = useState(false);
  /** Add and Remove show over the page's photo after a tap on it (#369). */
  const [photoMenu, setPhotoMenu] = useState(false);
  const customSeq = useRef(0);
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<"chips" | "generate" | "send" | null>(null);
  const [sent, setSent] = useState(false);
  /** Stickers put on the page before it is sent; they are saved with it. */
  const [stickers, setStickers] = useState<DecorItem[]>([]);
  /** The sent report shown on the card — the paper the sitter can decorate (12.3b). */
  const [sentId, setSentId] = useState<string | null>(null);
  /** The photos on the sent page, the first one added is the main one. */
  const [sentPhotos, setSentPhotos] = useState<string[]>([]);

  const refreshChips = useCallback(
    async (mediaIds: string[]) => {
      setBusy("chips");
      try {
        const res = await suggestChips(pet.id, mediaIds);
        setChips(res.chips);
        setSummary(res.summary);
        setDescriptions(res.photos);
      } catch (e) {
        toast.show((e as Error).message, { tone: "error" });
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
          setSentId(existing.id);
          setSentPhotos(existing.photoUrls ?? (existing.photoUrl ? [existing.photoUrl] : []));
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
        setSentId(null);
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

  /** A photo for the page: up to four, the first one is the main photo; the chips are read again from all of them. */
  const addPhoto = async () => {
    setPhotoMenu(false);
    if (busy || photos.length >= MAX_PAGE_PHOTOS) return;
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
    setPhotoMenu(false);
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
      errorDialog.show({ title: "Couldn't write the page", message: (e as Error).message, onRetry: () => void generate() });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (busy || !body.trim()) return;
    setBusy("send");
    try {
      // A page written only by hand has no draft row yet: save it as today's draft first (014b), then send.
      const id = draft?.id ?? (await saveDraftByHand(pet.id, body.trim()));
      await sendReport(id, body.trim());
      if (stickers.length > 0 && sitterId) {
        try {
          await saveDecor(id, sitterId, stickers);
        } catch {
          toast.show("Sent, but the stickers weren't saved.");
        }
        setStickers([]);
      }
      // The photos added show on the page the owner reads, the first one as the main photo.
      if (photos.length > 0) {
        try {
          await setDiaryPagePhotos(id, photos.map((p) => p.mediaId));
        } catch {
          toast.show("Sent, but the photo wasn't added to the page.");
        }
      }
      setSent(true);
      setSentId(id);
      setSentPhotos(photos.map((p) => p.thumbUrl).filter(Boolean));
      setDraft(null);
      toast.show(`Sent. ${pet.ownerName} was told`);
    } catch (e) {
      errorDialog.show({ title: "Not sent", message: (e as Error).message, onRetry: () => void send() });
    } finally {
      setBusy(null);
    }
  };

  // The Diary pins this pet's Send at the bottom of the screen; it reads the latest `send` through the ref.
  const sendRef = useRef(send);
  sendRef.current = send;
  const sendLabel = busy === "send" ? "Sending…" : `Send to ${pet.ownerName}`;
  const sendDisabled = busy != null || !body.trim();
  const sendable = !loading && !sent;
  useEffect(() => {
    onSendBar?.(sendable ? { label: sendLabel, disabled: sendDisabled, onPress: () => void sendRef.current() } : null);
  }, [onSendBar, sendable, sendLabel, sendDisabled]);
  useEffect(() => () => onSendBar?.(null), [onSendBar]);

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
    setSentId(null);
    setSentPhotos([]);
    setBody("");
    setStickers([]);
    setOff(new Set());
    setCustom([]);
    setOverrides({});
    setPhotos([]);
    setPhotoMenu(false);
    setDescriptions([]);
    setChips([]);
    void refreshChips([]);
  };

  if (sent) {
    return (
      <Card style={styles.card} testID={`report-${pet.id}`}>
        <Text style={styles.title}>{pet.name}</Text>
        <Tag label={`Sent to ${pet.ownerName} ✓`} tone="success" testID={`report-sent-${pet.id}`} />
        {sentId ? (
          <DecoratedReport
            reportId={sentId}
            petId={pet.id}
            petName={pet.name}
            day={day.current}
            body={body}
            pictureUrl={sentPhotos[0] ?? null}
            pictureUrls={sentPhotos}
            testID={`report-sent-paper-${pet.id}`}
          />
        ) : (
          <Text style={styles.body}>{body}</Text>
        )}
        {sentId ? <PageActions reportId={sentId} action="delete" other={pet.ownerName} onDone={writeAnother} /> : null}
        <Button label="Write another page" variant="secondary" onPress={writeAnother} testID={`report-another-${pet.id}`} />
        <Text style={styles.muted}>It covers what happens from now on.</Text>
      </Card>
    );
  }

  const pagePhoto = photos[0] ?? null;
  // The picture box is the photo button (#369): empty, it opens the picker; with photos, Add and Remove (the photo showing).
  const picturePress = pagePhoto
    ? {
        onPress: () => setPhotoMenu((open) => !open),
        label: "Change the photos",
        testID: `report-photo-change-${pet.id}`,
        actions: (index: number) =>
          photoMenu ? (
            <>
              {photos.length < MAX_PAGE_PHOTOS ? <PhotoAction label="Add" onPress={() => void addPhoto()} testID={`report-photo-add-${pet.id}`} /> : null}
              <PhotoAction label="Remove" onPress={() => removePhoto((photos[index] ?? pagePhoto).mediaId)} testID={`report-photo-remove-${pet.id}`} />
            </>
          ) : undefined,
      }
    : { onPress: () => void addPhoto(), label: "Add a photo", testID: `report-add-photo-${pet.id}` };

  // Not sent yet: the page is there from the start (Diary book). The sitter writes on it by hand, or lets Goldito write
  // it from the chips below; either way it stays a draft only they can see until they tap Send (pinned by the Diary).
  return (
    <Card style={styles.card} testID={`report-${pet.id}`}>
      {draft || body.trim() ? (
        <Text style={styles.muted} testID={`report-state-${pet.id}`}>
          {`Draft. Only you can see it until you send it to ${pet.ownerName}.`}
        </Text>
      ) : null}
      {draft?.fallback ? (
        <Text style={styles.muted} testID={`report-fallback-${pet.id}`}>
          The writing helper is down. Here's a plain list to edit and send.
        </Text>
      ) : null}
      <DecoratedReport
        reportId={null}
        petId={pet.id}
        petName={pet.name}
        day={day.current}
        body={body}
        pictureUrl={pagePhoto?.thumbUrl || null}
        pictureUrls={photos.map((p) => p.thumbUrl).filter(Boolean)}
        pending={{ items: stickers, onChange: setStickers }}
        picturePress={busy != null ? undefined : picturePress}
        writing={{
          onChangeText: setBody,
          placeholder: "Dear diary, today…",
          maxLength: REPORT_BODY_MAX,
          disabled: busy != null,
          testID: `report-body-${pet.id}`,
        }}
        testID={`report-page-${pet.id}`}
      />

      <Button
        label={busy === "generate" ? "Writing…" : body.trim() ? "Rewrite the page from the chips" : "Write the page from the chips"}
        variant="secondary"
        ai
        disabled={busy != null}
        onPress={() => void generate()}
        testID={`report-generate-${pet.id}`}
      />
      {body.trim() ? <Text style={styles.muted}>This replaces what's on the page. Nothing is sent.</Text> : null}

      <View style={styles.chipsHead}>
        <Text style={styles.label}>Today's chips</Text>
        {summary ? (
          <Text style={styles.summary} numberOfLines={1} testID={`report-summary-${pet.id}`}>
            {summaryLine(summary)}
          </Text>
        ) : null}
      </View>
      {all.length > 0 ? (
        <>
          <ChipSuggestions chips={all} off={off} onToggle={toggle} onRemove={removeCustom} testIDPrefix={`report-chip-${pet.id}`} />
          {highlights.length > REPORT_MAX_HIGHLIGHTS ? (
            <Text style={styles.muted} testID={`report-too-many-${pet.id}`}>
              {`Only ${REPORT_MAX_HIGHLIGHTS} highlights fit on the page. Turn a few off.`}
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.muted} testID={`report-nochips-${pet.id}`}>
          {busy === "chips" ? "Looking at today…" : "Nothing recorded yet. Add a photo or a short line."}
        </Text>
      )}

      {customOpen ? (
        <View style={styles.addRow}>
          <View style={styles.addField}>
            <TextField
              label="One short line"
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
      ) : null}
      <View style={styles.links}>
        {!customOpen ? <TextButton label="+ Add a line" onPress={() => setCustomOpen(true)} testID={`report-custom-open-${pet.id}`} /> : null}
        {editable.length > 0 ? (
          <TextButton label="Fix a recorded value" onPress={() => setEditing(true)} testID={`report-edit-${pet.id}`} />
        ) : null}
      </View>
      <Sheet visible={editing} title="Fix a recorded value" onClose={() => setEditing(false)} doneOnly testID={`report-edit-sheet-${pet.id}`}>
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
    </Card>
  );
}

function PhotoAction({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action} testID={testID}>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { gap: theme.spacing.sm },
    title: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    label: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
    muted: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    body: { fontSize: theme.fontSize.body, color: theme.color.text },
    chipsHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: theme.spacing.sm, marginTop: theme.spacing.xs },
    summary: { flexShrink: 1, fontSize: theme.fontSize.caption, color: theme.color.textMuted },
    links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: theme.spacing.sm },
    editGroup: { gap: theme.spacing.xs },
    editPills: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    addRow: { flexDirection: "row", alignItems: "flex-end", gap: theme.spacing.sm },
    addField: { flex: 1 },
    action: {
      minHeight: 36,
      paddingHorizontal: theme.spacing.md,
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
    },
    actionLabel: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
