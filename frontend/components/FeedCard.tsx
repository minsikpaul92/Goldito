import { createElement, useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { formatFeedTime, type FeedTimelinePost } from "../lib/feed";
import { thumbUrl, videoPosterUrl, videoUrl } from "../lib/cloudinary";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  post: FeedTimelinePost;
  /** Open the full-screen viewer. */
  onOpen: () => void;
};

/**
 * Instagram-style album cell.
 * - Tap photo / playing video → full-screen viewer
 * - ▶ / ❚❚ = play·pause in the cell; ✕ = back to poster
 * - No native controls (no ⋯ / scrubber)
 */
export function FeedCard({ post, onOpen }: Props) {
  const styles = useThemedStyles(makeStyles);
  const isVideo = post.media.resourceType === "video";
  const poster = isVideo
    ? videoPosterUrl(post.media.publicId, 400)
    : thumbUrl(post.media.publicId, 400);
  const [playingInline, setPlayingInline] = useState(false);
  const [paused, setPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setPlayingInline(false);
    setPaused(false);
  }, [post.id]);

  useEffect(() => {
    if (!playingInline || !videoRef.current) return;
    const el = videoRef.current;
    const onEnded = () => {
      setPlayingInline(false);
      setPaused(false);
    };
    el.addEventListener("ended", onEnded);
    if (paused) {
      el.pause();
    } else {
      void el.play().catch(() => {
        el.muted = true;
        void el.play();
      });
    }
    return () => el.removeEventListener("ended", onEnded);
  }, [playingInline, paused]);

  const stopInline = () => {
    videoRef.current?.pause();
    setPlayingInline(false);
    setPaused(false);
  };

  const expand = () => {
    stopInline();
    onOpen();
  };

  return (
    <View style={styles.card} testID={`feed-card-${post.id}`}>
      {isVideo && playingInline && Platform.OS === "web" ? (
        <>
          {createElement("video", {
            ref: (el: HTMLVideoElement | null) => {
              videoRef.current = el;
            },
            // Inline preview can stay lighter; fullscreen uses 1080.
            src: videoUrl(post.media.publicId, 720),
            controls: false,
            playsInline: true,
            "webkit-playsinline": "true",
            autoPlay: true,
            preload: "auto",
            style: {
              width: "100%",
              height: "100%",
              objectFit: "contain",
              backgroundColor: "#000",
              pointerEvents: "none",
            },
            "data-testid": `feed-inline-video-${post.id}`,
          })}
          {/* Tap the video (not ✕ / play) → expand. Siblings only — no nested buttons. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open full screen"
            onPress={expand}
            style={StyleSheet.absoluteFill}
            testID={`feed-inline-open-${post.id}`}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop and show thumbnail"
            onPress={stopInline}
            style={[styles.cornerBtn, styles.cornerLeft]}
            testID={`feed-inline-stop-${post.id}`}
          >
            <Text style={styles.cornerIcon}>✕</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={paused ? "Play" : "Pause"}
            onPress={() => setPaused((p) => !p)}
            style={styles.playBadge}
            testID={`feed-inline-toggle-${post.id}`}
          >
            <Text style={styles.playIcon}>{paused ? "▶" : "❚❚"}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${post.caption ?? "Photo"} from ${post.authorName}, ${formatFeedTime(post.createdAt)}`}
            onPress={onOpen}
            style={StyleSheet.absoluteFill}
          >
            {poster ? (
              <Image
                source={{ uri: poster }}
                style={styles.image}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={[styles.image, styles.placeholder]} />
            )}
          </Pressable>
          {post.visibility === "private" ? (
            <View style={styles.lockBadge} pointerEvents="none" testID={`feed-private-${post.id}`}>
              <Text style={styles.cornerIcon}>🔒</Text>
            </View>
          ) : null}
          {isVideo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Play video here"
              hitSlop={8}
              onPress={() => {
                setPaused(false);
                setPlayingInline(true);
              }}
              style={styles.playBadge}
              testID={`feed-play-${post.id}`}
            >
              <Text style={styles.playIcon}>▶</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flex: 1,
      aspectRatio: 1,
      backgroundColor: theme.color.border,
      overflow: "hidden",
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
      right: theme.spacing.xs,
      bottom: theme.spacing.xs,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.color.overlay,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 3,
    },
    playIcon: {
      color: theme.color.primaryText,
      fontSize: 11,
      marginLeft: 1,
    },
    cornerBtn: {
      position: "absolute",
      top: theme.spacing.xs,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.color.overlay,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 3,
    },
    lockBadge: {
      position: "absolute",
      top: theme.spacing.xs,
      left: theme.spacing.xs,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.color.overlay,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
    },
    cornerLeft: {
      left: theme.spacing.xs,
    },
    cornerIcon: {
      color: theme.color.primaryText,
      fontSize: 13,
      fontWeight: "700",
    },
  });
