import { router } from "expo-router";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Image, LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { TextButton } from "../../components/ui/TextButton";
import { deliveryUrl, thumbUrl, videoPosterUrl } from "../../lib/cloudinary";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useSession } from "../../providers/SessionProvider";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { SPIRAL_W, SpiralEdge } from "../diary/SpiralEdge";
import { listReportPhotos } from "../diary/reportApi";
import { formatDay } from "../schedule/dates";
import { DecorItem, DecorLayer, MAX_ITEMS, listDecor, saveDecor } from "./decorApi";
import { renderDiaryPage } from "./diaryImage";
import { SharePageSheet } from "./SharePageSheet";
import { PRESET_STICKERS, isPreset, presetRef, presetUri } from "./presetStickers";
import { StickerCanvas } from "./StickerCanvas";
import { PetSticker, listStickers } from "./stickerApi";

const SCALE_MIN = 0.4;
const SCALE_MAX = 2.5;
/** One ruled line of the diary (px): the text's line height, so the writing sits on the lines. */
const LINE = 30;
const MIN_LINES = 6;
/** The picture box is the same height for owner and sitter, so a sticker lands in the same spot for both. */
const PICTURE_HEIGHT = 180;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Picture-diary handwriting (web): Gaegu, Google Fonts (SIL OFL). Native keeps the system font.
export const DIARY_FONT = Platform.select({ web: 'Gaegu, "Comic Sans MS", system-ui, sans-serif', default: undefined });
const FONT_LINK_ID = "goldito-diary-font";

export function useDiaryFont() {
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

/** The page as the sitter writes it, before it is sent: no stickers yet, the words are a text field. */
export type DiaryWriting = { onChangeText: (text: string) => void; placeholder: string; maxLength: number; disabled?: boolean; testID?: string };

type Props = {
  /** A sent report (its sticker layers, Decorate, Share); null while the page is still being written. */
  reportId: string | null;
  petId: string;
  petName: string;
  day: string;
  body: string;
  writing?: DiaryWriting;
  /** The owner's own page (014p): the picture may be one of the owner's private photos. */
  ownPage?: boolean;
  /** The page's own photo (014t), or a photo just added to a page being written. Without one: the day's first shared photo. */
  pictureUrl?: string | null;
  /**
   * Stickers put on a page that is still being written (no report row yet): kept by the parent and saved with the
   * page once it exists. Without it a page being written has no Decorate.
   */
  pending?: { items: DecorItem[]; onChange: (items: DecorItem[]) => void };
  /**
   * The picture box is a button (the owner's new page, #369): it adds a photo, or with one in, shows `actions` (Replace,
   * Remove) over it. Off while decorating.
   */
  picturePress?: { onPress: () => void; label: string; testID?: string; actions?: ReactNode };
  /** Told when Decorate opens or closes (the diary book holds still meanwhile). */
  onEditingChange?: (editing: boolean) => void;
  testID?: string;
};

/**
 * A sent daily report as a picture-diary page both people decorate (Phase 12.3b · 12.4, D61): the date and the pet on
 * top, the day's photo in the picture box, the sitter's words on ruled lines in a handwriting font. The owner (diary
 * entry) and the sitter (their sent report) see the same page — same text, same size — so a sticker sits in the same
 * spot for both. Each person's stickers are their own layer: "✨ Decorate" edits mine (Goldito stickers or the pet's
 * own; drag to move, the corners to size, turn and remove, all by mouse or touch). "↗ Share" sends the page as
 * shown, both layers included (11.8 · DB.5): the image, a download, or a public link. Web only for now.
 *
 * Page layers, bottom to top: paper → picture + ruled lines → stickers behind the text → the text → stickers over it.
 */
export function DecoratedReport({ reportId, petId, petName, day, body, writing, ownPage, pictureUrl, pending, picturePress, onEditingChange, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [writtenHeight, setWrittenHeight] = useState(0);
  const [focused, setFocused] = useState(false);
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
  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);
  const [draft, setDraft] = useState<DecorItem[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [box, setBox] = useState<PetSticker[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const paperRef = useRef<View>(null);
  const pictureRef = useRef<View>(null);
  const linesRef = useRef<View>(null);
  const headerRef = useRef<View>(null);
  const textRef = useRef<View>(null);

  const load = useCallback(async () => {
    if (!reportId) {
      setLayers([]);
      return;
    }
    try {
      setLayers(await listDecor(reportId));
    } catch {
      setLayers([]); // the page still shows; stickers are a bonus
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The picture box: the page's own photo; without one, the day's first shared photo, if there is one.
  const shownPicture = pictureUrl || picture;
  useEffect(() => {
    if (pictureUrl) return;
    let live = true;
    listReportPhotos(petId, day, ownPage && role === "owner")
      .then((photos) => {
        const first = photos[0];
        if (!live || !first) return;
        setPicture(first.resourceType === "video" ? videoPosterUrl(first.publicId, 600) : thumbUrl(first.publicId, 600) || null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [petId, day, ownPage, role, pictureUrl]);

  const drafting = !reportId && !!pending;
  const mine = drafting ? pending.items : (layers.find((l) => l.userId === me)?.items ?? []);
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

  // The corner handle or a pinch (#369).
  const transform = (index: number, scale: number, rotate: number) =>
    setDraft((items) =>
      items.map((item, i) =>
        i === index ? { ...item, scale: Math.min(SCALE_MAX, Math.max(SCALE_MIN, +scale.toFixed(2))), rotate: Math.round(rotate) % 360 } : item,
      ),
    );

  // The × on the picked sticker's corner (#369).
  const remove = (index: number) => {
    setDraft((items) => items.filter((_, i) => i !== index));
    setSelected(null);
  };

  const save = async () => {
    if (drafting) {
      // Not a report yet: the parent keeps the stickers and saves them with the page.
      pending.onChange(draft);
      setEditing(false);
      setSelected(null);
      toast.show("Stickers added");
      return;
    }
    if (!me || !reportId || saving) return;
    setSaving(true);
    try {
      await saveDecor(reportId, me, draft);
      setLayers((now) => [...now.filter((l) => l.userId !== me), { userId: me, items: draft }]);
      setEditing(false);
      setSelected(null);
      toast.show("Stickers saved");
    } catch (error) {
      errorDialog.show({ title: "Stickers not saved", message: (error as Error).message, onRetry: () => void save() });
    } finally {
      setSaving(false);
    }
  };

  /** The page as it is on screen, drawn to a PNG (11.8) — for Share → image, download or public link (DB.5). */
  const renderPage = async () => {
    const dom = (ref: { current: View | null }) => ref.current as unknown as HTMLElement | null;
    const [paper, pic, rules, header, text] = [dom(paperRef), dom(pictureRef), dom(linesRef), dom(headerRef), dom(textRef)];
    if (!paper || !pic || !rules || !header || !text) throw new Error("The page isn't on screen yet.");
    // The same stacking as the screen: the other person's stickers, then mine above them, each side on its own.
    const stickers = canvasLayers.flatMap((layer) =>
      layer.items.map((item) => ({
        url: stickerUrl(item.public_id),
        x: item.x,
        y: item.y,
        scale: item.scale,
        rotate: item.rotate,
        z: item.z + (layer.mine ? 1000 : 0),
        layer: item.layer ?? "front",
      })),
    );
    return renderDiaryPage({ paper, picture: pic, pictureUrl: shownPicture, lines: rules, text: [header, text], stickers });
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
      <View ref={paperRef} style={[styles.paper, editing && styles.paperEditing, focused && styles.paperWriting]} testID={id("paper")}>
        <SpiralEdge testID={id("spiral")} />
        <View ref={linesRef} pointerEvents="none" style={[styles.lines, { top: lines.top, height: ruled * LINE }]}>
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
          onTransform={transform}
          onRemove={remove}
          urlFor={stickerUrl}
        />
        <View ref={headerRef} pointerEvents={passThrough} style={styles.header} testID={id("header")}>
          <Text style={styles.headerText}>{`📅 ${longDay(day)}`}</Text>
          <Text style={styles.headerText}>{`${petName}'s day 🐾`}</Text>
        </View>
        <View ref={pictureRef} pointerEvents={passThrough} style={styles.picture} testID={id("picture")}>
          {shownPicture ? (
            <Image source={{ uri: shownPicture }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Text style={styles.pictureEmpty}>🖍️</Text>
          )}
          {picturePress && !editing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={picturePress.label}
              onPress={picturePress.onPress}
              style={StyleSheet.absoluteFill}
              testID={picturePress.testID}
            />
          ) : null}
          {picturePress?.actions && !editing ? <View style={styles.pictureActions}>{picturePress.actions}</View> : null}
        </View>
        <View ref={textRef} pointerEvents={passThrough} style={[styles.textArea, { minHeight: MIN_LINES * LINE }]} onLayout={onTextLayout}>
          {writing ? (
            // The sitter writes straight onto the page (Diary book): the same font and lines as the sent page.
            <TextInput
              value={body}
              onChangeText={writing.onChangeText}
              placeholder={writing.placeholder}
              placeholderTextColor={theme.color.textMuted}
              maxLength={writing.maxLength}
              editable={!writing.disabled}
              multiline
              accessibilityLabel={`${petName}'s diary page`}
              onContentSizeChange={(e) => setWrittenHeight(e.nativeEvent.contentSize.height)}
              // The paper shows where the cursor is (a primary border), not a box around the words.
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={[styles.body, styles.input, { height: Math.max(MIN_LINES * LINE, Math.ceil(writtenHeight / LINE) * LINE) }]}
              testID={writing.testID}
            />
          ) : (
            <Text style={styles.body} testID={id("body")}>
              {body}
            </Text>
          )}
        </View>
        <StickerCanvas
          which="front"
          zIndex={3}
          layers={canvasLayers}
          editing={editing}
          selected={selected}
          onSelect={select}
          onMove={(index, x, y) => setDraft((items) => items.map((item, i) => (i === index ? { ...item, x, y } : item)))}
          onTransform={transform}
          onRemove={remove}
          urlFor={stickerUrl}
        />
      </View>

      {Platform.OS !== "web" || !me || (!reportId && !pending) ? null : editing ? (
        <View style={styles.tools} testID="decor-tools">
          <Text style={styles.hint}>
            {current ? "Drag to move. Drag the corner to size and turn." : "Add a sticker, then drag it anywhere on the page."}
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
                {`No stickers of ${petName} yet. Make one in Snap.`}
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
        <View style={styles.row}>
          <TextButton label="Decorate" onPress={() => void start()} testID="decor-start" />
          {reportId && !writing ? <TextButton label="↗ Share" onPress={() => setSharing(true)} testID="decor-share" /> : null}
        </View>
      )}
      {reportId && !writing && Platform.OS === "web" ? (
        <SharePageSheet
          visible={sharing}
          onClose={() => setSharing(false)}
          petId={petId}
          petName={petName}
          day={day}
          render={renderPage}
          version={JSON.stringify(layers)}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.spacing.sm },
    paper: {
      // The spiral binding sits in the gutter to the left of the paper.
      marginLeft: SPIRAL_W,
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.color.border,
      backgroundColor: theme.color.surface,
    },
    paperEditing: { borderColor: theme.color.primary, borderStyle: "dashed" },
    paperWriting: { borderColor: theme.color.primary },
    header: { zIndex: 2, flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.sm },
    headerText: { fontFamily: DIARY_FONT, fontSize: theme.fontSize.body + 2, fontWeight: theme.fontWeight.bold, color: theme.color.text },
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
    pictureActions: { position: "absolute", bottom: theme.spacing.sm, flexDirection: "row", gap: theme.spacing.sm },
    lines: { position: "absolute", left: theme.spacing.md, right: theme.spacing.md, zIndex: 0 },
    rule: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: theme.color.border },
    textArea: { zIndex: 2 },
    // Writing on the page: no box of its own, the ruled lines show through.
    // No focus box on the web (the paper border shows focus instead).
    input: { padding: 0, borderWidth: 0, backgroundColor: "transparent", textAlignVertical: "top", ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) },
    body: { fontFamily: DIARY_FONT, fontSize: theme.fontSize.body + 4, lineHeight: LINE, color: theme.color.text },
    tools: { gap: theme.spacing.sm },
    group: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.textMuted },
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
  });
