import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { StayToday } from "../../features/care/useStayToday";
import { ProfilePhoto, loadProfilePhotos, photoThumb } from "../../features/profile/profilePhotosApi";
import { useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { tokens } from "../../theme/tokens";
import { PhotoViewerSheet } from "../PhotoViewerSheet";
import { Avatar } from "../ui/Avatar";
import { HOME_TEXT, LIVE_DOT } from "./homeType";

/** "Max is with Chloe", "Max & Mochi are with Chloe", "Max, Mochi & Bo are with Chloe". */
export function stayTitle(names: string[], sitter: string): string {
  const who = names.length <= 2 ? names.join(" & ") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  return `${who} ${names.length === 1 ? "is" : "are"} with ${sitter}`;
}

/** Owner Home: the pets that are with a sitter right now (Figma "block.g"). Brand green, not the skin's ink. */
export function StayHero({ stay }: { stay: StayToday }) {
  const styles = useThemedStyles(makeStyles);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [viewing, setViewing] = useState(false);
  const sitterId = stay.sitterId;

  // Read again whenever Home comes back into view, and when the photos are opened: the sitter may have added some.
  const refresh = useCallback(() => {
    let live = true;
    loadProfilePhotos(sitterId)
      .then((list) => live && setPhotos(list))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sitterId]);
  useFocusEffect(refresh);

  return (
    <View style={styles.card} testID="stay-hero">
      <View style={styles.top}>
        <View style={styles.live}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{`With ${stay.sitterName} now`}</Text>
        </View>
        {stay.days > 1 ? <Text style={styles.day}>{`Day ${stay.day} of ${stay.days}`}</Text> : null}
      </View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.title}>{stayTitle(stay.pets.map((p) => p.name), stay.sitterName)}</Text>
          {stay.receivedLine ? <Text style={styles.sub}>{stay.receivedLine}</Text> : null}
        </View>
        <Pressable
          accessibilityRole={photos.length > 0 ? "button" : undefined}
          accessibilityLabel={`${stay.sitterName}'s photos`}
          disabled={photos.length === 0}
          onPress={() => {
            refresh();
            setViewing(true);
          }}
          style={styles.photo}
          testID="stay-sitter-photo"
        >
          {photos.length > 0 ? (
            <Image source={{ uri: photoThumb(photos[0], 192) }} style={styles.photoImage} accessibilityIgnoresInvertColors />
          ) : (
            <Avatar kind="initial" name={stay.sitterName} size={72} />
          )}
        </Pressable>
      </View>
      <View style={styles.care}>
        <View style={styles.careHead}>
          <Text style={styles.careText}>Today's care</Text>
          <Text style={styles.careText}>{`${stay.care.done} of ${stay.care.total} done`}</Text>
        </View>
        {/* One step per task: they share the bar's width, so more tasks mean thinner steps. */}
        <View style={[styles.bar, stay.care.total > 8 && styles.barDense]} accessibilityLabel={`${stay.care.done} of ${stay.care.total} care tasks done`}>
          {Array.from({ length: Math.max(1, stay.care.total) }, (_, i) => (
            <View key={i} style={[styles.seg, i < stay.care.done ? styles.segOn : styles.segOff]} />
          ))}
        </View>
      </View>
      <PhotoViewerSheet visible={viewing} title={stay.sitterName} photos={photos} onClose={() => setViewing(false)} testID="stay-sitter-photos" />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Figma: #2D6A4F, radius 28, padding 18. The skin's `primary` is the darker ink, so the brand token is used directly.
    card: { backgroundColor: tokens.color.primary, borderRadius: 28, padding: 18, gap: 12 },
    top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    live: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: theme.radius.pill,
      backgroundColor: "rgba(0,0,0,0.22)",
    },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIVE_DOT },
    liveText: { fontSize: HOME_TEXT.small, fontWeight: theme.fontWeight.bold, color: tokens.color.onMedia },
    day: { fontSize: HOME_TEXT.body, fontWeight: theme.fontWeight.bold, color: theme.color.accent },
    row: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
    rowText: { flex: 1, gap: theme.spacing.sm },
    title: {
      ...(theme.fontFamily.display ? { fontFamily: theme.fontFamily.display } : { fontWeight: theme.fontWeight.bold }),
      fontSize: HOME_TEXT.hero,
      lineHeight: 26,
      color: tokens.color.onMedia,
    },
    sub: { fontSize: HOME_TEXT.body, lineHeight: 17.5, color: theme.color.accent },
    photo: {
      width: 96,
      height: 96,
      borderRadius: 22,
      borderWidth: 3,
      borderColor: tokens.color.onMedia,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    photoImage: { width: "100%", height: "100%" },
    care: { gap: 8 },
    careHead: { flexDirection: "row", justifyContent: "space-between" },
    careText: { fontSize: HOME_TEXT.body, lineHeight: 17.5, fontWeight: theme.fontWeight.bold, color: tokens.color.onMedia },
    bar: { flexDirection: "row", gap: 6 },
    barDense: { gap: 3 },
    seg: { flex: 1, height: 8, borderRadius: 4 },
    segOn: { backgroundColor: tokens.color.gold },
    segOff: { backgroundColor: "rgba(255,255,255,0.22)" },
  });
