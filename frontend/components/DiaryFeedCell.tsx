import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import type { DiaryCell } from "../features/diary/diaryFeed";
import { formatDay } from "../features/schedule/dates";
import { thumbUrl, videoPosterUrl } from "../lib/cloudinary";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

/** A sent diary page in the Feed grid (Diary book DB.4): the day's first photo, a 📔 badge and the date. */
export function DiaryFeedCell({ cell, onOpen }: { cell: DiaryCell; onOpen: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const uri = cell.thumb
    ? cell.thumb.resourceType === "video"
      ? videoPosterUrl(cell.thumb.publicId, 400)
      : thumbUrl(cell.thumb.publicId, 400)
    : "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${cell.petName}'s diary, ${formatDay(cell.day)}: ${cell.preview}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={`feed-diary-${cell.reportId}`}
    >
      {cell.thumb ? (
        // `data-public-id` says which photo is the thumbnail (also where no Cloudinary name is set, as in CI).
        <View style={styles.image} testID={`feed-diary-thumb-${cell.reportId}`} {...({ dataSet: { publicId: cell.thumb.publicId } } as object)}>
          {uri ? <Image source={{ uri }} style={styles.image} accessibilityIgnoresInvertColors /> : null}
        </View>
      ) : (
        <Text style={styles.empty}>📔</Text>
      )}
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeText}>📔</Text>
      </View>
      <View style={styles.caption} pointerEvents="none">
        <Text style={styles.captionText} numberOfLines={1}>{`Diary · ${formatDay(cell.day)}`}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flex: 1,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      position: "relative",
      backgroundColor: theme.color.accent,
    },
    pressed: { opacity: 0.8 },
    image: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
    empty: { fontSize: theme.icon.hero },
    badge: {
      position: "absolute",
      top: theme.spacing.xs,
      left: theme.spacing.xs,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.color.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { fontSize: 13 },
    caption: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 2,
      backgroundColor: theme.color.overlay,
    },
    captionText: { fontSize: theme.fontSize.small, fontWeight: theme.fontWeight.bold, color: theme.color.primaryText },
  });
