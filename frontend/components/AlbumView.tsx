import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { formatDay, isoToZoned } from "../features/schedule/dates";
import { thumbUrl, videoPosterUrl } from "../lib/cloudinary";
import { FeedTimelinePost, buildAlbum } from "../lib/feed";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  posts: FeedTimelinePost[];
  onOpen: (postId: string) => void;
};

/**
 * The feed as an album (phase-09 9.5): a header per day, under it the day's photos sorted into
 * 🍚 Meals · 🐕 Walks · 😴 Naps · 🎾 Play · ✨ Moments, three thumbnails per row. Empty groups are left out.
 */
export function AlbumView({ posts, onOpen }: Props) {
  const styles = useThemedStyles(makeStyles);
  const days = buildAlbum(posts, (iso) => isoToZoned(iso).day);

  return (
    <View style={styles.root} testID="feed-album">
      {days.map(({ day, groups }) => (
        <View key={day} style={styles.day} testID={`album-day-${day}`}>
          <Text accessibilityRole="header" style={styles.dayTitle}>
            {`${formatDay(day)}, ${day.slice(0, 4)}`}
          </Text>
          {groups.map((group) => (
            <View key={group.key} style={styles.group} testID={`album-group-${day}-${group.key}`}>
              <Text style={styles.groupTitle}>{`${group.emoji} ${group.label} · ${group.posts.length}`}</Text>
              <View style={styles.grid}>
                {group.posts.map((post) => (
                  <Pressable
                    key={post.id}
                    accessibilityRole="button"
                    accessibilityLabel={post.caption ?? "Photo"}
                    onPress={() => onOpen(post.id)}
                    style={styles.cell}
                    testID={`album-photo-${post.id}`}
                  >
                    <Image
                      source={{
                        uri:
                          post.media.resourceType === "video"
                            ? videoPosterUrl(post.media.publicId, 300)
                            : thumbUrl(post.media.publicId, 300),
                      }}
                      style={styles.thumb}
                      accessibilityIgnoresInvertColors
                    />
                    {post.media.resourceType === "video" ? <Text style={styles.play}>▶</Text> : null}
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: { gap: theme.spacing.lg },
    day: { gap: theme.spacing.sm },
    dayTitle: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    group: { gap: theme.spacing.xs },
    groupTitle: { fontSize: theme.fontSize.small, fontWeight: "600", color: theme.color.textMuted },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
    cell: { width: "32.4%", aspectRatio: 1, borderRadius: theme.radius.sm, overflow: "hidden", backgroundColor: theme.color.border },
    thumb: { width: "100%", height: "100%" },
    play: { position: "absolute", right: 6, bottom: 4, color: "#fff", fontSize: 14 },
  });
