import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { formatFeedTime, type FeedTimelinePost } from "../lib/feed";
import { thumbUrl, videoPosterUrl } from "../lib/cloudinary";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  post: FeedTimelinePost;
  onPress: () => void;
};

/** Kidsnote-style feed card: 4:3 thumb, caption, relative time, sitter name (phase-05). */
export function FeedCard({ post, onPress }: Props) {
  const styles = useThemedStyles(makeStyles);
  const isVideo = post.media.resourceType === "video";
  const uri = isVideo
    ? videoPosterUrl(post.media.publicId, 400)
    : thumbUrl(post.media.publicId, 400);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${post.caption ?? "Photo"} from ${post.sitterName}, ${formatFeedTime(post.createdAt)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={`feed-card-${post.id}`}
    >
      <View style={styles.media}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.image, styles.placeholder]} />
        )}
        {isVideo ? (
          <View style={styles.playBadge} accessibilityElementsHidden>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        ) : null}
      </View>
      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
      <Text style={styles.meta}>
        {post.sitterName} · {formatFeedTime(post.createdAt)}
      </Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.color.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.color.border,
      overflow: "hidden",
      gap: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
    },
    pressed: {
      opacity: 0.85,
    },
    media: {
      width: "100%",
      aspectRatio: 4 / 3,
      backgroundColor: theme.color.border,
      position: "relative",
    },
    image: {
      width: "100%",
      height: "100%",
    },
    placeholder: {
      backgroundColor: theme.color.border,
    },
    playBadge: {
      position: "absolute",
      right: theme.spacing.sm,
      bottom: theme.spacing.sm,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.color.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    playIcon: {
      color: theme.color.primaryText,
      fontSize: theme.fontSize.small,
      marginLeft: 2,
    },
    caption: {
      fontSize: theme.fontSize.body,
      color: theme.color.text,
      paddingHorizontal: theme.spacing.md,
    },
    meta: {
      fontSize: theme.fontSize.small,
      color: theme.color.textMuted,
      paddingHorizontal: theme.spacing.md,
    },
  });
