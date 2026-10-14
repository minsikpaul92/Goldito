import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { TextButton } from "../../components/ui/TextButton";
import { deliveryUrl, thumbUrl, videoPosterUrl } from "../../lib/cloudinary";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { listReportPhotos } from "../diary/reportApi";
import { formatDay } from "../schedule/dates";
import { DecorItem, DecorLayer, MAX_ITEMS, listDecor, saveDecor } from "./decorApi";
import { PRESET_STICKERS, isPreset, presetRef, presetUri } from "./presetStickers";
import { StickerCanvas } from "./StickerCanvas";
import { PetSticker, listStickers } from "./stickerApi";

const SCALE_MIN = 0.4;
const SCALE_MAX = 2.5;
const SCALE_STEP = 0.2;
const ROTATE_STEP = 15;
/** One ruled line of the diary (px): the text's line height, so the writing sits on the lines. */
const LINE = 30;
const MIN_LINES = 6;
/** The picture box is the same height for owner and sitter, so a sticker lands in the same spot for both. */
const PICTURE_HEIGHT = 180;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Picture-diary handwriting (web): Gaegu, Google Fonts (SIL OFL). Native keeps the system font.
const DIARY_FONT = Platform.select({ web: 'Gaegu, "Comic Sans MS", system-ui, sans-serif', default: undefined });
const FONT_LINK_ID = "goldito-diary-font";

function useDiaryFont() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&display=swap";
    document.head.appendChild(link);
  }, []);
}

const stickerUrl = (ref: string) => (isPreset(ref) ? presetUri(ref) : deliveryUrl(ref, 320));

function longDay(day: string): string {
  const weekday = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
  return `${weekday}, ${formatDay(day)}`;
}

type Props = { reportId: string; petId: string; petName: string; day: string; body: string; testID?: string };

/**
 * A sent daily report as a picture-diary page both people decorate (Phase 12.3b · 12.4, D61): the date and the pet on
 * top, the day's photo in the picture box, the sitter's words on ruled lines in a handwriting font. The owner (diary
 * entry) and the sitter (their sent report) see the same page — same text, same size — so a sticker sits in the same
 * spot for both. Each person's stickers are their own layer: "✨ Decorate" edits mine (Goldito stickers or the pet's
 * own, drag to move, size, turn, over or behind the writing, remove — all by mouse). Web only for now.
 *
 * Page layers, bottom to top: paper → picture + ruled lines → stickers behind the text → the text → stickers over it.
 */
export function DecoratedReport({ reportId, petId, petName, day, body, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const session = useSession();
  const me = session.status === "signedIn" ? session.profile.id : null;
  const role = session.status === "signedIn" ? session.profile.role : null;
  useDiaryFont();

  const [layers, setLayers] = useState<DecorLayer[]>([]);
  const [picture, setPicture] = useState<string | null>(null);
  const [lines, setLines] = useState({ top: 0, height: MIN_LINES * LINE });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DecorItem[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [box, setBox] = useState<PetSticker[] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLayers(await listDecor(reportId));
    } catch {
      setLayers([]); // the page still shows; stickers are a bonus
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The picture box: the day's first shared photo, if there is one.
  useEffect(() => {
    let live = true;
    listReportPhotos(petId, day)
      .then((photos) => {
        const first = photos[0];
        if (!live || !first) return;
        setPicture(first.resourceType === "video" ? videoPosterUrl(first.publicId, 600) : thumbUrl(first.publicId, 600) || null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [petId, day]);

  const mine = layers.find((l) => l.userId === me)?.items ?? [];
  const others = layers.filter((l) => l.userId !== me);
  const shownMine = editing ? draft : mine;
  const canvasLayers = [...others.map((l) => ({ items: l.items, mine: false })), { items: shownMine, mine: true }];
  const current = selected === null ? null : (draft[selected] ?? null);

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
    // The picked sticker comes to the front of its side.
    setDraft((items) => items.map((item, i) => (i === index ? { ...item, z: topZ(items) } : item)));
  };

  const add = (ref: string, stickerId: string) => {
    if (draft.length >= MAX_ITEMS) return;
    const offset = (draft.length % 5) * 0.04; // a few in a row do not land exactly on top of each other
    const item: DecorItem = { sticker_id: stickerId, public_id: ref, x: 0.5 + offset, y: 0.5 + offset, scale: 1, rotate: 0, z: topZ(draft), layer: "front" };
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
      setLayers((now) => [...now.filter((l) => l.userId !== me), { userId: me, items: draft }]);
      setEditing(false);
      setSelected(null);
      toast.show("Stickers saved ✨");
    } catch (error) {
      errorDialog.show({ title: "Stickers not saved", message: (error as Error).message, onRetry: () => void save() });
    } finally {
      setSaving(false);
    }
  };

  const onTextLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setLines({ top: y, height });
  };

  const id = (suffix: string) => (testID ? `${testID}-${suffix}` : undefined);
  const ruled = Math.max(MIN_LINES, Math.ceil(lines.height / LINE));
  // While decorating, the words and the picture let clicks through to the stickers behind them.
  const passThrough = editing ? "none" : "auto";

  return (
    <View style={styles.wrap}>
      <View style={[styles.paper, editing && styles.paperEditing]} testID={id("paper")}>
        <View pointerEvents="none" style={[styles.lines, { top: lines.top, height: ruled * LINE }]}>
          {Array.from({ length: ruled }, (_, i) => (
            <View key={i} style={[styles.rule, { top: (i + 1) * LINE - 1 }]} />
          ))}
        </View>
        <StickerCanvas
          which="back"
          zIndex={1}
          layers={canvasLayers}
          editing={editing}
          selected={selected}
          onSelect={select}
          onMove={(index, x, y) => setDraft((items) => items.map((item, i) => (i === index ? { ...item, x, y } : item)))}
          urlFor={stickerUrl}
        />
        <View pointerEvents={passThrough} style={styles.header} testID={id("header")}>
          <Text style={styles.headerText}>{`📅 ${longDay(day)}`}</Text>
          <Text style={styles.headerText}>{`${petName}'s day 🐾`}</Text>
        </View>
        <View pointerEvents={passThrough} style={styles.picture} testID={id("picture")}>
          {picture ? (
            <Image source={{ uri: picture }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Text style={styles.pictureEmpty}>🖍️</Text>
          )}
        </View>
        <View pointerEvents={passThrough} style={[styles.textArea, { minHeight: MIN_LINES * LINE }]} onLayout={onTextLayout}>
          <Text style={styles.body} testID={id("body")}>
            {body}
          </Text>
        </View>
        <StickerCanvas
          which="front"
          zIndex={3}
          layers={canvasLayers}
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
            {current ? "Drag to move · size, turn, or tuck it behind the writing below." : "Add a sticker, then drag it anywhere on the page."}
          </Text>

          <Text style={styles.group}>Goldito stickers</Text>
          <View style={styles.strip}>
            {PRESET_STICKERS.map((preset) => (
              <Pressable
                key={preset.id}
                accessibilityRole="button"
                accessibilityLabel={`Add the ${preset.label} sticker`}
                disabled={draft.length >= MAX_ITEMS}
                onPress={() => add(presetRef(preset), presetRef(preset))}
                style={styles.thumb}
                testID={`decor-preset-${preset.id}`}
              >
                <Image source={preset.source} style={styles.thumbImage} resizeMode="contain" />
              </Pressable>
            ))}
          </View>

          <Text style={styles.group}>{`${petName}'s stickers`}</Text>
          {box === null ? null : box.length === 0 ? (
            <View style={styles.row}>
              <Text style={styles.hint} testID="decor-no-stickers">
                {`No stickers of ${petName} yet — make one in Snap.`}
              </Text>
              <TextButton label="Make a sticker" onPress={() => role && router.push(`/${role}/snap/sticker`)} testID="decor-make" />
            </View>
          ) : (
            <View style={styles.strip}>
              {box.map((sticker) => (
                <Pressable
                  key={sticker.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Add this sticker of ${petName}`}
                  disabled={draft.length >= MAX_ITEMS}
                  onPress={() => add(sticker.publicId, sticker.id)}
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

          {current ? (
            <View style={styles.row}>
              <Tool label="−" hint="Smaller" onPress={() => change((i) => ({ scale: Math.max(SCALE_MIN, +(i.scale - SCALE_STEP).toFixed(2)) }))} testID="decor-smaller" />
              <Tool label="+" hint="Bigger" onPress={() => change((i) => ({ scale: Math.min(SCALE_MAX, +(i.scale + SCALE_STEP).toFixed(2)) }))} testID="decor-bigger" />
              <Tool label="↺" hint="Turn left" onPress={() => change((i) => ({ rotate: (i.rotate - ROTATE_STEP) % 360 }))} testID="decor-rotate-left" />
              <Tool label="↻" hint="Turn right" onPress={() => change((i) => ({ rotate: (i.rotate + ROTATE_STEP) % 360 }))} testID="decor-rotate-right" />
              <Tool
                label={current.layer === "back" ? "⬆ Over text" : "⬇ Behind text"}
                hint={current.layer === "back" ? "Put it over the writing" : "Tuck it behind the writing"}
                onPress={() => change((i) => ({ layer: i.layer === "back" ? "front" : "back" }))}
                testID="decor-layer"
              />
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
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    paperEditing: { borderColor: theme.color.primary, borderStyle: "dashed" },
    header: { zIndex: 2, flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.sm },
    headerText: { fontFamily: DIARY_FONT, fontSize: theme.fontSize.body + 2, fontWeight: "700", color: theme.color.text },
    picture: {
      zIndex: 0,
      height: PICTURE_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderRadius: theme.radius.sm,
      borderWidth: 2,
      borderColor: theme.color.text,
      backgroundColor: theme.color.accent,
    },
    pictureEmpty: { fontSize: theme.icon.hero },
    lines: { position: "absolute", left: theme.spacing.md, right: theme.spacing.md, zIndex: 0 },
    rule: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: theme.color.border },
    textArea: { zIndex: 2 },
    body: { fontFamily: DIARY_FONT, fontSize: theme.fontSize.body + 4, lineHeight: LINE, color: theme.color.text },
    tools: { gap: theme.spacing.sm },
    group: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
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
