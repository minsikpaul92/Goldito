import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { StayToday } from "../../features/care/useStayToday";
import { loadPetPhotos, petPhotoThumb } from "../../features/ownerOnboarding/petPhotosApi";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Theme } from "../../theme/themes";
import { tokens } from "../../theme/tokens";
import { HomeArt } from "./HomeArt";
import { HOME_TEXT, LIVE_DOT } from "./homeType";

/** "Max is with Chloe", "Max & Mochi are with Chloe", "Max, Mochi & Bo are with Chloe". */
export function stayTitle(names: string[], sitter: string): string {
  const who = names.length <= 2 ? names.join(" & ") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  return `${who} ${names.length === 1 ? "is" : "are"} with ${sitter}`;
}

/** Owner Home: the pets that are with a sitter right now (Figma "block.g"). Brand green, not the skin's ink. */
export function StayHero({ stay }: { stay: StayToday }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [cover, setCover] = useState<string | null>(null);
  const firstPetId = stay.pets[0]?.id;

  useEffect(() => {
    if (!firstPetId) return;
    let live = true;
    loadPetPhotos(firstPetId)
      .then((photos) => live && setCover(photos[0]?.publicId ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [firstPetId]);

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
        <View style={styles.photo}>
          {cover ? (
            <Image source={{ uri: petPhotoThumb(cover, 192) }} style={styles.photoImage} accessibilityIgnoresInvertColors />
          ) : (
            <HomeArt name="paw" size={40} color={tokens.color.onMedia} />
          )}
        </View>
      </View>
      {stay.care ? (
        <View style={styles.care}>
          <View style={styles.careHead}>
            <Text style={styles.careText}>Today's care</Text>
            <Text style={styles.careText}>{`${stay.care.done} of ${stay.care.total} done`}</Text>
          </View>
          <View style={styles.bar} accessibilityLabel={`${stay.care.done} of ${stay.care.total} care tasks done`}>
            {Array.from({ length: stay.care.total }, (_, i) => (
              <View key={i} style={[styles.seg, i < stay.care!.done ? styles.segOn : styles.segOff]} />
            ))}
          </View>
        </View>
      ) : null}
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
    seg: { flex: 1, height: 8, borderRadius: 4 },
    segOn: { backgroundColor: tokens.color.gold },
    segOff: { backgroundColor: "rgba(255,255,255,0.22)" },
  });
