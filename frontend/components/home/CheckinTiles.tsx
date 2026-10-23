import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SentCheckin, listTodayCheckins, logCareCheckin } from "../../features/care/careApi";
import { HOME_TILES, HomeTileKey, MEMO_MAX, TileOption, homeTilesFor } from "../../features/care/checkinOptions";
import type { CaringPet } from "../../features/feed/caringPets";
import { formatTime, isoToZoned } from "../../features/schedule/dates";
import { useErrorDialog } from "../../providers/ErrorDialogProvider";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import { Theme } from "../../theme/themes";
import { tokens } from "../../theme/tokens";
import { Button } from "../ui/Button";
import type { ArtName } from "../../assets/art/artSvgs";
import { Icon, IconName } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { TextField } from "../ui/TextField";
import { HomeArt } from "./HomeArt";
import { HOME_TEXT } from "./homeType";

/** A second tap on the same tile this soon after the first sends the first choice. */
const DOUBLE_TAP_MS = 400;

const TILE_LOOK: Record<HomeTileKey, { icon: IconName; art?: ArtName; ground: string }> = {
  ate: { icon: "meal", art: "sitter/ate", ground: tokens.color.blockPeach },
  potty: { icon: "potty", art: "sitter/potty", ground: tokens.color.blockMint },
  walk: { icon: "walk", art: "sitter/walk", ground: tokens.color.blockButter },
  nap: { icon: "nap", ground: tokens.color.blockButter },
  mood: { icon: "heart", art: "sitter/mood", ground: tokens.color.blockBlush },
};

/**
 * Quick check-in tiles (Figma "checks"): tap a tile and its choices open above it; two quick taps send the first
 * choice. "Other" asks for a few words, which are what the owner reads. Every send is a care check-in, so the owner is
 * told and the pet room reacts.
 */
export function CheckinTiles({ pet, onSent }: { pet: CaringPet; onSent?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const toast = useToast();
  const errorDialog = useErrorDialog();
  const [open, setOpen] = useState<HomeTileKey | null>(null);
  const openedAt = useRef(0);
  const [memoFor, setMemoFor] = useState<{ key: HomeTileKey; option: TileOption } | null>(null);
  const [memo, setMemo] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SentCheckin[]>([]);

  // What this sitter already sent for the pet today: a check mark and the time on the tile (the full list is in My history).
  const loadSent = useCallback(async () => {
    try {
      setSent(await listTodayCheckins(pet.id));
    } catch {
      // A convenience; sending works without it.
    }
  }, [pet.id]);
  useFocusEffect(
    useCallback(() => {
      void loadSent();
    }, [loadSent]),
  );

  const send = async (option: TileOption, note: string | null) => {
    if (sending) return;
    setSending(true);
    try {
      await logCareCheckin({ petId: pet.id, kind: option.kind, value: option.value, note, mediaId: null });
      toast.show(`Sent. ${pet.ownerName} was told`);
      setOpen(null);
      setMemoFor(null);
      setMemo("");
      void loadSent();
      onSent?.();
    } catch (e) {
      errorDialog.show({ title: "Not sent", message: e instanceof Error ? e.message : "Try again.", onRetry: () => void send(option, note) });
    } finally {
      setSending(false);
    }
  };

  const choose = (key: HomeTileKey, option: TileOption) => {
    if (option.memo) {
      setOpen(null);
      setMemo("");
      setMemoFor({ key, option });
      return;
    }
    void send(option, null);
  };

  const tap = (key: HomeTileKey) => {
    const now = Date.now();
    if (open === key) {
      // Quick second tap: the first choice goes out. A slow one just closes the choices.
      if (now - openedAt.current < DOUBLE_TAP_MS) choose(key, HOME_TILES[key].options[0]);
      else setOpen(null);
      return;
    }
    openedAt.current = now;
    setOpen(key);
  };

  const keys = homeTilesFor(pet.species);
  const kindsOf: Record<HomeTileKey, string[]> = { ate: ["meal"], potty: ["potty"], walk: ["walk"], nap: ["nap", "wake"], mood: ["mood"] };
  const lastOf = (key: HomeTileKey) => sent.find((c) => kindsOf[key].includes(c.kind));
  const options = open ? HOME_TILES[open].options : [];

  return (
    <View style={styles.wrap} testID="checkin-tiles">
      {open ? (
        <View style={styles.popover} testID={`tile-options-${open}`}>
          {options.map((option, i) => (
            <Pressable
              key={`${option.kind}-${option.value}`}
              accessibilityRole="button"
              disabled={sending}
              onPress={() => choose(open, option)}
              style={({ pressed }) => [styles.option, i === 0 && styles.optionFirst, pressed && styles.pressed]}
              testID={`tile-option-${open}-${option.value ?? option.kind}`}
            >
              {option.icon ? <Icon name={option.icon} size={18} color={tokens.color.text} /> : null}
              <Text style={[styles.optionText, i === 0 && styles.optionTextFirst]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        {keys.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={`${HOME_TILES[key].label} ${pet.name}`}
            accessibilityState={{ expanded: open === key }}
            onPress={() => tap(key)}
            style={({ pressed }) => [styles.tile, { backgroundColor: TILE_LOOK[key].ground }, open === key && styles.tileOpen, pressed && styles.pressed]}
            testID={`tile-${key}`}
          >
            <HomeArt name={TILE_LOOK[key].icon} art={TILE_LOOK[key].art} size={40} color={tokens.color.text} />
            <Text style={styles.label}>{HOME_TILES[key].label}</Text>
            {lastOf(key) ? (
              <Text style={styles.sentMark} testID={`tile-sent-${key}`}>{`✓ ${formatTime(isoToZoned(lastOf(key)!.at).time)}`}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
      <Sheet
        visible={memoFor != null}
        title={memoFor ? `${HOME_TILES[memoFor.key].label} · Other` : ""}
        onClose={() => setMemoFor(null)}
        footer={
          <Button
            label="Send"
            onPress={() => memoFor && void send(memoFor.option, memo.trim())}
            disabled={memo.trim().length === 0 || sending}
            testID="tile-memo-send"
          />
        }
        testID="tile-memo"
      >
        <TextField label={`What happened with ${pet.name}?`} value={memo} onChangeText={setMemo} maxLength={MEMO_MAX} testID="tile-memo-text" />
      </Sheet>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Above the rest of the page, so the choices float over what is behind them.
    wrap: { position: "relative", zIndex: 10 },
    row: { flexDirection: "row", gap: 10 },
    tile: { flex: 1, height: 84, alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 4, borderRadius: theme.radius.xl },
    sentMark: { fontSize: HOME_TEXT.kicker, lineHeight: 14, fontWeight: theme.fontWeight.bold, color: theme.color.primary },
    tileOpen: { borderWidth: 2, borderColor: theme.color.text },
    label: { fontSize: HOME_TEXT.body + 0.5, lineHeight: 18.2, fontWeight: theme.fontWeight.bold, color: theme.color.text },
    popover: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "100%",
      marginBottom: 8,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
      padding: theme.spacing.sm,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.color.surface,
      borderWidth: 1,
      borderColor: theme.color.border,
      shadowColor: theme.color.text,
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    option: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.color.borderStrong,
      backgroundColor: theme.color.surface,
    },
    // The one a double tap sends.
    optionFirst: { backgroundColor: theme.color.accent, borderColor: theme.color.text },
    optionText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.semibold, color: theme.color.text },
    optionTextFirst: { fontWeight: theme.fontWeight.bold },
    pressed: { opacity: 0.8 },
  });
