import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { TextButton } from "../../components/ui/TextButton";
import { deliveryUrl } from "../../lib/cloudinary";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { DecorItem, DecorLayer, MAX_ITEMS, listDecor, saveDecor } from "./decorApi";
import { StickerCanvas } from "./StickerCanvas";
import { PetSticker, listStickers } from "./stickerApi";

const SCALE_MIN = 0.4;
const SCALE_MAX = 2.5;
const SCALE_STEP = 0.2;
const ROTATE_STEP = 15;

const stickerUrl = (publicId: string) => deliveryUrl(publicId, 320);

/**
 * A sent daily report as a sheet of paper both people decorate (Phase 12.3b, D61). The owner (diary entry) and the
 * sitter (their sent report) see the same paper — same text, same size — so a sticker sits in the same spot for both.
 * Each person's stickers are their own layer: "✨ Decorate" edits mine (add from the pet's sticker box, drag to move,
 * size, rotate, remove — all by mouse), the other person's layer stays as it is underneath. Web only for now.
 */
export function DecoratedReport({ reportId, petId, body, testID }: { reportId: string; petId: string; body: string; testID?: string }) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const session = useSession();
  const me = session.status === "signedIn" ? session.profile.id : null;
  const role = session.status === "signedIn" ? session.profile.role : null;

  const [layers, setLayers] = useState<DecorLayer[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DecorItem[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [box, setBox] = useState<PetSticker[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLayers(await listDecor(reportId));
    } catch {
      setLayers([]); // the text still shows; stickers are a bonus
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = layers.find((l) => l.userId === me)?.items ?? [];
  const others = layers.filter((l) => l.userId !== me);
  const shownMine = editing ? draft : mine;

  const start = async () => {
    setDraft(mine.map((item) => ({ ...item })));
    setSelected(null);
    setEditing(true);
    try {
      setBox(await listStickers(petId));
    } catch {
      setBox([]);
    }
  };

  const topZ = (items: DecorItem[]) => items.reduce((z, item) => Math.max(z, item.z), 0) + 1;

  const select = (index: number | null) => {
    setSelected(index);
    if (index === null) return;
    // The picked sticker comes to the front of my layer.
    setDraft((items) => items.map((item, i) => (i === index ? { ...item, z: topZ(items) } : item)));
  };

  const add = (sticker: PetSticker) => {
    if (draft.length >= MAX_ITEMS) return;
    const offset = (draft.length % 5) * 0.04; // a few in a row do not land exactly on top of each other
    const item: DecorItem = {
      sticker_id: sticker.id,
      public_id: sticker.publicId,
      x: 0.5 + offset,
      y: 0.5 + offset,
      scale: 1,
      rotate: 0,
      z: topZ(draft),
    };
    setDraft([...draft, item]);
    setSelected(draft.length);
  };

  const change = (patch: (item: DecorItem) => Partial<DecorItem>) => {
    if (selected === null) return;
    setDraft((items) => items.map((item, i) => (i === selected ? { ...item, ...patch(item) } : item)));
  };

  const remove = () => {
    if (selected === null) return;
    setDraft((items) => items.filter((_, i) => i !== selected));
    setSelected(null);
  };

  const save = async () => {
    if (!me || saving) return;
    setSaving(true);
    try {
      await saveDecor(reportId, me, draft);
      setLayers((current) => [...current.filter((l) => l.userId !== me), { userId: me, items: draft }]);
      setEditing(false);
      setSelected(null);
      toast.show("Stickers saved ✨");
    } catch (error) {
      errorDialog.show({ title: "Stickers not saved", message: (error as Error).message, onRetry: () => void save() });
    } finally {
      setSaving(false);
    }
  };

  const id = (suffix: string) => (testID ? `${testID}-${suffix}` : undefined);

  return (
    <View style={styles.wrap}>
      <View style={[styles.paper, editing && styles.paperEditing]} testID={id("paper")}>
        <Text style={styles.body} testID={id("body")}>
          {body}
        </Text>
        <StickerCanvas
          layers={[...others.map((l) => ({ items: l.items, mine: false })), { items: shownMine, mine: true }]}
          editing={editing}
          selected={selected}
          onSelect={select}
          onMove={(index, x, y) => setDraft((items) => items.map((item, i) => (i === index ? { ...item, x, y } : item)))}
          urlFor={stickerUrl}
        />
      </View>

      {Platform.OS !== "web" || !me ? null : editing ? (
        <View style={styles.tools} testID="decor-tools">
          <Text style={styles.hint}>
            {selected === null ? "Add a sticker, then drag it where you like." : "Drag to move · size and turn it below."}
          </Text>
          {box === null ? null : box.length === 0 ? (
            <View style={styles.row}>
              <Text style={styles.hint} testID="decor-no-stickers">
                No stickers yet — make one in Snap.
              </Text>
              <TextButton label="Make a sticker" onPress={() => role && router.push(`/${role}/snap/sticker`)} testID="decor-make" />
            </View>
          ) : (
            <View style={styles.strip}>
              {box.map((sticker) => (
                <Pressable
                  key={sticker.id}
                  accessibilityRole="button"
                  accessibilityLabel="Add this sticker"
                  disabled={draft.length >= MAX_ITEMS}
                  onPress={() => add(sticker)}
                  style={styles.thumb}
                  testID="decor-add"
                >
                  {stickerUrl(sticker.publicId) ? (
                    <Image source={{ uri: stickerUrl(sticker.publicId) }} style={styles.thumbImage} resizeMode="contain" />
                  ) : (
                    <Text>🐾</Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}
          {selected !== null ? (
            <View style={styles.row}>
              <Tool label="−" hint="Smaller" onPress={() => change((i) => ({ scale: Math.max(SCALE_MIN, +(i.scale - SCALE_STEP).toFixed(2)) }))} testID="decor-smaller" />
              <Tool label="+" hint="Bigger" onPress={() => change((i) => ({ scale: Math.min(SCALE_MAX, +(i.scale + SCALE_STEP).toFixed(2)) }))} testID="decor-bigger" />
              <Tool label="↺" hint="Turn left" onPress={() => change((i) => ({ rotate: (i.rotate - ROTATE_STEP) % 360 }))} testID="decor-rotate-left" />
              <Tool label="↻" hint="Turn right" onPress={() => change((i) => ({ rotate: (i.rotate + ROTATE_STEP) % 360 }))} testID="decor-rotate-right" />
              <Tool label="Remove" hint="Remove this sticker" onPress={remove} testID="decor-remove" />
            </View>
          ) : null}
          <Button label={saving ? "Saving…" : "Save stickers"} onPress={() => void save()} disabled={saving} testID="decor-save" />
          <TextButton
            label="Cancel"
            onPress={() => {
              setEditing(false);
              setSelected(null);
            }}
            testID="decor-cancel"
          />
        </View>
      ) : (
        <TextButton label="✨ Decorate" onPress={() => void start()} style={styles.decorate} testID="decor-start" />
      )}
    </View>
  );
}

function Tool({ label, hint, onPress, testID }: { label: string; hint: string; onPress: () => void; testID: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={hint} onPress={onPress} style={styles.tool} testID={testID}>
      <Text style={styles.toolLabel}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.spacing.sm },
    paper: {
      minHeight: 200,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    paperEditing: { borderColor: theme.color.primary, borderStyle: "dashed" },
    body: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },
    tools: { gap: theme.spacing.sm },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.spacing.sm },
    strip: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    thumb: {
      width: 56,
      height: 56,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.accent,
    },
    thumbImage: { width: 48, height: 48 },
    tool: {
      minWidth: 44,
      height: 36,
      paddingHorizontal: theme.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    toolLabel: { fontSize: theme.fontSize.body, fontWeight: "600", color: theme.color.text },
    decorate: { alignSelf: "flex-start" },
  });
