import { router } from "expo-router";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, LayoutChangeEvent, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
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
/** The picture box's width / height, one shape for owner and sitter so a sticker lands in the same spot for both. A photo is framed to it before it goes on a page, so it fills the box. */
export const PHOTO_ASPECT = 5 / 3;
/** A white wash the page shows through (the floating buttons and the tray). */
const SEE_THROUGH = "rgba(255,255,255,0.82)";
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
  /** Up to four photos (015x), the main one first: drag the picture to turn through them; "1/2" shows at the top right. */
  pictureUrls?: string[];
  /**
   * Stickers put on a page that is still being written (no report row yet): kept by the parent and saved with the
   * page once it exists. Without it a page being written has no Decorate.
   */
  pending?: { items: DecorItem[]; onChange: (items: DecorItem[]) => void };
  /**
   * The picture box is a button (the owner's new page, #369): it adds a photo, or with one in, shows `actions` (Replace,
   * Remove) over it. Off while decorating.
   */
  picturePress?: { onPress: () => void; label: string; testID?: string; actions?: ReactNode | ((index: number) => ReactNode) };
  /** Told when Decorate opens or closes (the diary book holds still meanwhile). */
  onEditingChange?: (editing: boolean) => void;
  testID?: string;
};

/**
 * A sent daily report as a picture-diary page both people decorate (Phase 12.3b · 12.4, D61): the date and the pet on
 * top, the day's photo in the picture box, the sitter's words on ruled lines in a handwriting font. The owner (diary
 * entry) and the sitter (their sent report) see the same page — same text, same size — so a sticker sits in the same
 * spot for both. Each person's stickers are their own layer: "Decorate" edits mine (Goldito stickers or the pet's
 * own; drag to move, the corners to size, turn and remove, all by mouse or touch). "↗ Share" sends the page as
 * shown, both layers included (11.8 · DB.5): the image, a download, or a public link. Web only for now.
 *
 * Page layers, bottom to top: paper → picture + ruled lines → stickers behind the text → the text → stickers over it.
 */
export function DecoratedReport({ reportId, petId, petName, day, body, writing, ownPage, pictureUrl, pictureUrls, pending, picturePress, onEditingChange, testID }: Props) {
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
  // The sticker tray is out while Decorate is open; a tap on a sticker of mine edits it with the tray folded away.
  const [trayOpen, setTrayOpen] = useState(true);
  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);
  const [draft, setDraft] = useState<DecorItem[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [box, setBox] = useState<PetSticker[] | null>(null);
  // What is saved now (JSON of the items): a sticker put on, moved or removed is saved on its own a moment later.
  const saved = useRef("");
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
  const shownPicture = pictureUrls?.[0] || pictureUrl || picture;
  const urls = pictureUrls && pictureUrls.length > 0 ? pictureUrls : shownPicture ? [shownPicture] : [];
  const many = urls.length > 1;
  // Which photo shows: a new photo comes up at once, and the index never points past the last one.
  const [photoIndex, setPhotoIndex] = useState(0);
  const lastCount = useRef(urls.length);
  useEffect(() => {
    setPhotoIndex((i) => (urls.length > lastCount.current ? urls.length - 1 : Math.min(i, Math.max(0, urls.length - 1))));
    lastCount.current = urls.length;
  }, [urls.length]);
  const at = Math.min(photoIndex, Math.max(0, urls.length - 1));
  const shownNow = urls[at] ?? null;
  const turnPhoto = (by: number) => setPhotoIndex((i) => (i + by + urls.length) % urls.length);
  // Dragging the picture turns the photos. It takes the gesture before the diary book's page turn does (the child's
  // responder is asked first), and only when there is more than one photo.
  const turnRef = useRef(turnPhoto);
  turnRef.current = turnPhoto;
  const manyRef = useRef(many);
  manyRef.current = many;
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => manyRef.current && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) > 40) turnRef.current(g.dx < 0 ? 1 : -1);
      },
    }),
  ).current;
  // Until the photo arrives the box shows a spinner, not a flat empty block (diary audit, Oct 27).
  const [loadedPicture, setLoadedPicture] = useState<string | null>(null);
  // A page being written starts with an empty box: the writer adds the photo (no photo of the day is put there for them).
  const blank = !!writing;
  useEffect(() => {
    if (pictureUrl || pictureUrls?.length || blank) return;
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
  }, [petId, day, ownPage, role, pictureUrl, pictureUrls, blank]);

  const drafting = !reportId && !!pending;
  const canDecorate = Platform.OS === "web" && !!me && (!!reportId || !!pending);
  const mine = drafting ? pending.items : (layers.find((l) => l.userId === me)?.items ?? []);
  const others = layers.filter((l) => l.userId !== me);
  const shownMine = editing ? draft : mine;
  const canvasLayers = [...others.map((l) => ({ items: l.items, mine: false })), { items: shownMine, mine: true }];
  const current = selected === null ? null : (draft[selected] ?? null);

  const start = async () => {
    setDraft(mine.map((item) => ({ ...item })));
    setSelected(null);
    saved.current = JSON.stringify(mine);
    setEditing(true);
    setTrayOpen(true);
    try {
      setBox(await listStickers(petId));
    } catch {
      setBox([]);
    }
  };

  const topZ = (items: DecorItem[]) => items.reduce((z, item) => Math.max(z, item.z), 0) + 1;

  /** A press on one of my stickers outside Decorate: edit it right there (move it, size it, take it off), no tray. */
  const grab = (index: number) => {
    setDraft(mine.map((item) => ({ ...item })));
    saved.current = JSON.stringify(mine);
    setEditing(true);
    setTrayOpen(false);
    setSelected(index);
  };

  const select = (index: number | null) => {
    if (!editing) {
      if (index !== null) grab(index);
      return;
    }
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

  // Every change is saved as it is made (no Save button): a sticker you do not like comes off with its ×.
  const persist = async (items: DecorItem[]) => {
    const json = JSON.stringify(items);
    if (json === saved.current) return;
    saved.current = json;
    if (drafting) {
      // Not a report yet: the parent keeps the stickers and saves them with the page.
      pending.onChange(items);
      return;
    }
    if (!me || !reportId) return;
    try {
      await saveDecor(reportId, me, items);
      setLayers((now) => [...now.filter((l) => l.userId !== me), { userId: me, items }]);
    } catch (error) {
      saved.current = "";
      errorDialog.show({ title: "Stickers not saved", message: (error as Error).message, onRetry: () => void persist(items) });
    }
  };
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => void persist(draft), 500);
    return () => clearTimeout(timer);
  }, [draft, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const stop = () => {
    void persist(draft);
    setEditing(false);
    setSelected(null);
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
          grabbable={canDecorate && !editing}
          selected={selected}
          onSelect={select}
          onMove={(index, x, y) => setDraft((items) => items.map((item, i) => (i === index ? { ...item, x, y } : item)))}
          onTransform={transform}
          onRemove={remove}
          urlFor={stickerUrl}
        />
        <View ref={headerRef} pointerEvents={passThrough} style={styles.header} testID={id("header")}>
          <Text style={[styles.headerText, styles.headerFit]} numberOfLines={1}>{`📅 ${longDay(day)}`}</Text>
          <Text style={[styles.headerText, styles.headerFit]} numberOfLines={1}>{`${petName}'s day 🐾`}</Text>
        </View>
        <View ref={pictureRef} pointerEvents={passThrough} style={styles.picture} testID={id("picture")} {...(many ? swipe.panHandlers : null)}>
          {shownNow ? (
            <>
              {loadedPicture !== shownNow ? <ActivityIndicator color={theme.color.textMuted} testID={id("picture-loading")} /> : null}
              <Image source={{ uri: shownNow }} style={StyleSheet.absoluteFill} resizeMode="cover" onLoad={() => setLoadedPicture(shownNow)} />
            </>
          ) : picturePress && !editing ? (
            // The box says what a tap does (the picture press covers it).
            <View style={styles.pictureEmpty}>
              <Icon name="photo" size={theme.icon.md} color={theme.color.text} />
              <Text style={styles.pictureEmptyText}>{picturePress.label}</Text>
            </View>
          ) : (
            <Icon name="photo" size={theme.icon.md} color={theme.color.textMuted} />
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
          {many && !editing ? (
            // "1/2": also a button that turns to the next photo, for anyone who does not drag.
            <Pressable accessibilityRole="button" accessibilityLabel="Next photo" onPress={() => turnPhoto(1)} style={styles.count} testID={id("count")}>
              <Text style={styles.countText}>{`${at + 1}/${urls.length}`}</Text>
            </Pressable>
          ) : null}
          {picturePress?.actions && !editing ? (
            <View style={styles.pictureActions}>{typeof picturePress.actions === "function" ? picturePress.actions(at) : picturePress.actions}</View>
          ) : null}
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
          grabbable={canDecorate && !editing}
          selected={selected}
          onSelect={select}
          onMove={(index, x, y) => setDraft((items) => items.map((item, i) => (i === index ? { ...item, x, y } : item)))}
          onTransform={transform}
          onRemove={remove}
          urlFor={stickerUrl}
        />
      </View>

      {Platform.OS !== "web" || !me || (!reportId && !pending) ? null : (
        // Floats at the screen's bottom right while the page scrolls (a zero-height sticky slot), so it never sits on the words.
        <View style={styles.floatSlot} pointerEvents="box-none">
          <View style={styles.float} pointerEvents="box-none">
            {editing && trayOpen ? (
              <ScrollView
                style={[styles.tray, box?.length === 0 && styles.trayWide]}
                contentContainerStyle={styles.trayContent}
                showsVerticalScrollIndicator={false}
                testID="decor-tools"
              >
                {box === null ? null : box.length === 0 ? (
                  <View style={styles.trayEmpty}>
                    <Text style={styles.hint} testID="decor-no-stickers">
                      {`No stickers of ${petName} yet.`}
                    </Text>
                    <TextButton label="Make a sticker" onPress={() => role && router.push(`/${role}/snap/sticker`)} testID="decor-make" />
                  </View>
                ) : (
                  box.map((sticker) => (
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
                  ))
                )}
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
              </ScrollView>
            ) : null}
            <View pointerEvents="box-none">
              <RoundButton
                label={editing ? (trayOpen ? "Hide the stickers" : "Show the stickers") : "Decorate"}
                onPress={() => (editing ? (trayOpen ? stop() : setTrayOpen(true)) : void start())}
                testID="decor-start"
              >
                <Icon name="sticker" size={22} color={theme.color.primary} />
              </RoundButton>
            </View>
          </View>
        </View>
      )}
      {reportId && !writing && !editing && Platform.OS === "web" ? (
        <Button
          label="Share"
          variant="secondary"
          icon={<Icon name="share" size={18} color={theme.color.primary} />}
          onPress={() => setSharing(true)}
          testID="decor-share"
        />
      ) : null}
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

/** A round, see-through button with one icon (Decorate and its Save, Cancel). */
function RoundButton({ label, onPress, disabled, testID, children }: { label: string; onPress: () => void; disabled?: boolean; testID: string; children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.round, pressed && styles.roundPressed]}
      testID={testID}
    >
      {children}
    </Pressable>
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
    // One line each, whatever the page's width or the pet's name.
    headerFit: { flexShrink: 1 },
    headerText: { fontFamily: DIARY_FONT, fontSize: theme.fontSize.body + 2, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    picture: {
      zIndex: 0,
      aspectRatio: PHOTO_ASPECT,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderRadius: theme.radius.sm,
      borderWidth: 2,
      borderColor: theme.color.text,
      backgroundColor: theme.color.accent,
    },
    count: {
      position: "absolute",
      top: theme.spacing.xs,
      right: theme.spacing.xs,
      minHeight: 22,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.xs + 2,
      borderRadius: theme.radius.pill,
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    countText: { fontSize: theme.fontSize.caption, fontWeight: theme.fontWeight.semibold, color: theme.color.primaryText },
    pictureEmpty: { alignItems: "center", gap: theme.spacing.xs },
    pictureEmptyText: { fontSize: theme.fontSize.small, lineHeight: theme.lineHeight.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    pictureActions: { position: "absolute", bottom: theme.spacing.sm, flexDirection: "row", gap: theme.spacing.sm },
    lines: { position: "absolute", left: theme.spacing.md, right: theme.spacing.md, zIndex: 0 },
    rule: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: theme.color.border },
    textArea: { zIndex: 2 },
    // Writing on the page: no box of its own, the ruled lines show through.
    // No focus box on the web (the paper border shows focus instead).
    input: { padding: 0, borderWidth: 0, backgroundColor: "transparent", textAlignVertical: "top", ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) },
    body: { fontFamily: DIARY_FONT, fontSize: theme.fontSize.body + 4, lineHeight: LINE, color: theme.color.text },
    hint: { fontSize: theme.fontSize.small, color: theme.color.textMuted },
    // A zero-height slot at the end of the page that sticks to the bottom of the scrolling screen; the buttons stand up from it.
    floatSlot: { ...(Platform.OS === "web" ? ({ position: "sticky" } as object) : null), bottom: theme.spacing.md, height: 0, zIndex: 20, overflow: "visible" },
    float: { position: "absolute", right: 0, bottom: 0, alignItems: "flex-end", gap: theme.spacing.sm },
    // About four stickers show; the rest are a drag away.
    tray: { width: 48, maxHeight: 4 * 48 + 3 * theme.spacing.sm + 2 * theme.spacing.sm, flexGrow: 0 },
    trayContent: { gap: theme.spacing.sm, paddingVertical: theme.spacing.sm, alignItems: "center" },
    trayWide: { width: 140 },
    trayEmpty: { gap: theme.spacing.xs, alignItems: "center", padding: theme.spacing.xs },
    round: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: SEE_THROUGH,
    },
    roundPressed: { opacity: 0.6 },
    thumb: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: theme.color.primary,
    },
    thumbImage: { width: 40, height: 40 },
  });
