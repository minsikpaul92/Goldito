import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SentCheckin, listTodayCheckins, logCareCheckin } from "../features/care/careApi";
import { MEMO_MAX, groupsFor } from "../features/care/checkinOptions";
import { checkinLabel } from "../features/diary/diaryApi";
import { formatTime, isoToZoned } from "../features/schedule/dates";
import { UploadError, uploadMedia } from "../lib/cloudinary";
import { pickMedia, type PickedMedia } from "../lib/media";
import { useErrorDialog } from "../providers/ErrorDialogProvider";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { useToast } from "../providers/ToastProvider";
import { Theme } from "../theme/themes";
import type { CareCheckinKind, Species } from "../types/db";
import { Art } from "./art/Art";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { TextButton } from "./ui/TextButton";
import { TextField } from "./ui/TextField";

type Props = {
  pet: { id: string; name: string; species: Species; ownerName: string };
  /** Opens the pet's photos (the link sits on the "Sent today" list). */
  onPhotos?: () => void;
};

/** The drawing beside each group and each sent line (Figma sitter art). */
const GROUP_ART = { meal: "sitter/ate", potty: "sitter/potty", walk: "sitter/walk", mood: "sitter/mood", nap: "feed/chip-naps", wake: "feed/chip-naps" } as const;

/**
 * The 5-second check (phase-06 6.10): tap what happened, then **Send**. With the memo empty the owner
 * gets a preset line ("Max ate everything"); a memo typed for something special replaces it. A photo
 * can ride along. A memo alone (nothing picked) is sent as a note. Layout: the Oct 25 design (design site,
 * Expressive prototype `sitter-checkin`): one card of big equal options, the memo beside Add photo, the day's sends.
 */
export function QuickCheckIn({ pet, onPhotos }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [sent, setSent] = useState<SentCheckin[]>([]);
  /** The option picked but not sent yet (`meal:all`); tapping it again unpicks it. */
  const [picked, setPicked] = useState<{ kind: CareCheckinKind; value: string } | null>(null);
  const [memo, setMemo] = useState("");
  const [photo, setPhoto] = useState<PickedMedia | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSent = useCallback(async () => {
    try {
      setSent(await listTodayCheckins(pet.id));
    } catch {
      // The strip is a convenience; a failed refresh must not block sending.
    }
  }, [pet.id]);

  useEffect(() => {
    void loadSent();
  }, [loadSent]);

  const send = async (kind: CareCheckinKind, value: string | null) => {
    if (sending) return;
    const note = memo.trim() || null;
    if (kind === "note" && !note) {
      setError("Type a note first.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      let mediaId: string | null = null;
      if (photo) {
        const uploaded = await uploadMedia({
          petId: pet.id,
          purpose: "task_proof",
          file: photo.file,
          resourceType: "image",
        });
        mediaId = uploaded.mediaId;
      }
      await logCareCheckin({ petId: pet.id, kind, value, note, mediaId });
      toast.show(`Sent. ${pet.ownerName} was told`);
      setMemo("");
      setPhoto(null);
      setPicked(null);
      void loadSent();
    } catch (e) {
      errorDialog.show({
        title: "Not sent",
        message: e instanceof UploadError || e instanceof Error ? e.message : "Try again.",
        onRetry: () => void send(kind, value),
      });
    } finally {
      setSending(false);
    }
  };

  const sendPicked = () => {
    if (picked) void send(picked.kind, picked.value);
    else void send("note", null);
  };

  const attachPhoto = async () => {
    if (sending) return;
    const picked = await pickMedia({ purpose: "task_proof", confirm: true, confirmLabel: "Use this photo" });
    if (picked) setPhoto(picked);
  };

  return (
    <View style={styles.wrap} testID={`checkin-${pet.id}`}>
      <View style={styles.card}>
        {groupsFor(pet.species).map((group) => {
          const walk = group.kind === "walk";
          return (
            <View key={group.kind} style={styles.group}>
              <View style={styles.groupHead}>
                <Art name={GROUP_ART[group.kind]} size={22} />
                <Text style={styles.groupLabel}>{group.label}</Text>
              </View>
              <View style={[styles.options, walk && styles.optionsWalk]}>
                {group.options.map((option) => {
                  const on = picked?.kind === group.kind && picked.value === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityLabel={`${group.label}: ${option.label}`}
                      aria-pressed={on}
                      disabled={sending}
                      onPress={() => setPicked(on ? null : { kind: group.kind, value: option.value })}
                      style={({ pressed }) => [styles.option, walk && styles.optionWalk, on && styles.optionOn, pressed && styles.pressed]}
                      testID={`checkin-${pet.id}-${group.kind}-${option.value}`}
                    >
                      {walk ? (
                        <>
                          <Text style={styles.walkNumber}>{option.value}</Text>
                          <Text style={styles.walkUnit}>min</Text>
                        </>
                      ) : (
                        <Text style={styles.optionText}>
                          {on ? `✓ ${option.label}` : option.label}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.memoRow}>
        <View style={styles.memo}>
          <TextField
            label="Anything special? (optional)"
            value={memo}
            maxLength={MEMO_MAX}
            placeholder="Skip for a preset note"
            onChangeText={(v) => {
              setMemo(v);
              setError(null);
            }}
            error={error}
            testID={`checkin-memo-${pet.id}`}
          />
        </View>
        <Button
          label={photo ? "Photo ready ✓" : "Add photo"}
          variant="secondary"
          icon={<Icon name="camera" size={20} color={theme.color.primary} />}
          disabled={sending}
          onPress={() => void attachPhoto()}
          style={styles.photoButton}
          testID={`checkin-photo-${pet.id}`}
        />
      </View>
      {photo ? <TextButton label="Remove photo" onPress={() => setPhoto(null)} style={styles.left} testID={`checkin-photo-remove-${pet.id}`} /> : null}

      {sent.length > 0 ? (
        <View style={styles.sentBox} testID={`checkin-sent-${pet.id}`}>
          <View style={styles.sentHead}>
            <Text style={styles.sentTitle}>{`Sent to ${pet.ownerName} today`}</Text>
            {onPhotos ? <TextButton label={`Photos of ${pet.name}`} onPress={onPhotos} testID="checkin-photos" /> : null}
          </View>
          {sent.slice(0, 4).map((c) => {
            const { label } = checkinLabel(c.kind, c.value);
            return (
              <View key={c.id} style={styles.sentRow} testID={`checkin-sent-item-${c.id}`}>
                {c.kind in GROUP_ART ? <Art name={GROUP_ART[c.kind as keyof typeof GROUP_ART]} size={20} /> : <Icon name="tip" size={18} color={theme.color.text} />}
                <Text style={styles.sentLine} numberOfLines={1}>
                  {`${label}${c.note ? ` · “${c.note}”` : ""}`}
                </Text>
                <Text style={styles.sentTime}>{formatTime(isoToZoned(c.at).time)}</Text>
              </View>
            );
          })}
          {sent.length > 4 ? <Text style={styles.sentMore}>{`+ ${sent.length - 4} earlier`}</Text> : null}
        </View>
      ) : onPhotos ? (
        <TextButton label={`Photos of ${pet.name}`} onPress={onPhotos} style={styles.left} testID="checkin-photos" />
      ) : null}

      <Text style={styles.ready} testID={`checkin-picked-${pet.id}`}>
        {picked
          ? `Ready to send: ${checkinLabel(picked.kind, picked.value).label}`
          : memo.trim()
            ? "Ready to send as a note"
            : "Pick what happened, add a memo or photo if you like, then Send."}
      </Text>
      <Button
        label={sending ? "Sending…" : "Send"}
        disabled={sending || (!picked && !memo.trim())}
        onPress={sendPicked}
        testID={`checkin-send-${pet.id}`}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) => {
  const display = theme.fontFamily.display;
  return StyleSheet.create({
    wrap: { gap: theme.spacing.md },
    card: { gap: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radius.xl, backgroundColor: theme.color.surface },
    group: { gap: theme.spacing.sm },
    groupHead: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    groupLabel: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
      ...(display ? { fontFamily: display } : { fontWeight: theme.fontWeight.bold }),
    },
    options: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    optionsWalk: { flexWrap: "nowrap", gap: 6 },
    // Big options that share each row and wrap as needed, so no label is ever cut (Check-in Tile family, DESIGN.md §6.2).
    option: {
      flexGrow: 1,
      flexBasis: "auto",
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: theme.radius.pill,
      borderWidth: 1.5,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    optionWalk: { flexBasis: 0, flexGrow: 1, paddingHorizontal: 0, borderRadius: theme.radius.md, minHeight: 52, gap: 0 },
    optionOn: { backgroundColor: theme.color.accent, borderColor: theme.color.primary, borderWidth: 2 },
    pressed: { opacity: 0.6 },
    optionText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    walkNumber: { fontSize: theme.fontSize.body, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    walkUnit: { fontSize: theme.fontSize.caption, color: theme.color.textMuted },
    memoRow: { flexDirection: "row", alignItems: "flex-end", gap: theme.spacing.sm },
    memo: { flex: 1, minWidth: 0 },
    photoButton: { flexShrink: 0 },
    left: { alignSelf: "flex-start" },
    sentBox: { gap: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.xl, backgroundColor: theme.color.accent },
    sentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.sm },
    sentTitle: { flex: 1, fontSize: theme.fontSize.caption, fontWeight: theme.fontWeight.bold, letterSpacing: 0.6, textTransform: "uppercase", color: theme.color.text },
    sentRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
    sentLine: { flex: 1, minWidth: 0, fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    sentTime: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    sentMore: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    ready: { textAlign: "center", fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
  });
};
