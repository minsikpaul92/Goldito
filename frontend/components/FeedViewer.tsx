import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { deliveryUrl, videoPosterUrl, videoUrl } from "../lib/cloudinary";
import { formatFeedTime, type FeedTimelinePost } from "../lib/feed";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  visible: boolean;
  posts: FeedTimelinePost[];
  initialPostId: string | null;
  onClose: () => void;
  onNearEnd?: () => void;
  /** When set, author-only Delete shows for the active post (5.7). */
  currentUserId?: string | null;
  /** Parent opens a confirm sheet (outside this Modal) then deletes. */
  onRequestDelete?: (postId: string) => void;
};

const SWIPE_DISTANCE = 50;

/**
 * Instagram-style post viewer: full-screen, swipe / arrow keys / arrow buttons for prev/next.
 * Renders ONLY the active post (5.10): a horizontal pager mounted every page and could not
 * open on the tapped index on Expo web (Safari), so a video at index 0 played instead.
 * The active post is tracked by id, so a Load more that grows `posts` never moves the viewer.
 */
export function FeedViewer({
  visible,
  posts,
  initialPostId,
  onClose,
  onNearEnd,
  currentUserId: _currentUserId,
  onRequestDelete,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [activeId, setActiveId] = useState<string | null>(initialPostId);
  const nearEndSent = useRef(false);

  // Open on the tapped post each time the viewer opens (or a different post is requested).
  // Reset during render, not in an effect, so the first frame never shows a stale post
  // (index 0 is often a video that would start playing).
  const openKey = visible ? initialPostId : null;
  const [seenKey, setSeenKey] = useState(openKey);
  if (seenKey !== openKey) {
    setSeenKey(openKey);
    setActiveId(initialPostId);
    nearEndSent.current = false;
  }

  const currentId = seenKey !== openKey ? initialPostId : activeId;
  const found = posts.findIndex((p) => p.id === currentId);
  const index = found >= 0 ? found : 0;
  const activePost: FeedTimelinePost | undefined = posts[index];

  const go = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(posts.length - 1, index + delta));
      const id = posts[next]?.id;
      if (id) setActiveId(id);
      if (onNearEnd && !nearEndSent.current && next >= posts.length - 2) {
        nearEndSent.current = true;
        onNearEnd();
      }
    },
    [index, onNearEnd, posts],
  );

  // A new page arrived (Load more) — allow the next near-end request.
  useEffect(() => {
    nearEndSent.current = false;
  }, [posts.length]);

  const goRef = useRef(go);
  goRef.current = go;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -SWIPE_DISTANCE) goRef.current(1);
          else if (g.dx >= SWIPE_DISTANCE) goRef.current(-1);
        },
      }),
    [],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goRef.current(1);
      else if (e.key === "ArrowLeft") goRef.current(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  if (!visible || !initialPostId || !activePost) return null;

  // Parent only wires onRequestDelete for authors (sitter feed). RLS still blocks non-authors.
  const canDelete = !!onRequestDelete;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      testID="feed-viewer"
    >
      <View style={styles.root} {...pan.panHandlers}>
        <ViewerPage
          key={activePost.id}
          post={activePost}
          bottomInset={insets.bottom}
        />

        {index > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous"
            onPress={() => go(-1)}
            style={[styles.arrow, styles.arrowLeft]}
            testID="feed-viewer-prev"
          >
            <Text style={styles.closeLabel}>‹</Text>
          </Pressable>
        ) : null}
        {index < posts.length - 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next"
            onPress={() => go(1)}
            style={[styles.arrow, styles.arrowRight]}
            testID="feed-viewer-next"
          >
            <Text style={styles.closeLabel}>›</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[styles.close, { top: Math.max(insets.top, 12) }]}
          testID="feed-viewer-close"
        >
          <Text style={styles.closeLabel}>✕</Text>
        </Pressable>

        {canDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete"
            onPress={() => onRequestDelete?.(activePost.id)}
            style={[styles.deleteBtn, { top: Math.max(insets.top, 12) }]}
            testID="feed-viewer-delete"
          >
            <Text style={styles.deleteLabel}>Delete</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

function ViewerPage({ post, bottomInset }: { post: FeedTimelinePost; bottomInset: number }) {
  const styles = useThemedStyles(makeStyles);
  const isVideo = post.media.resourceType === "video";
  const imageUri = isVideo
    ? videoPosterUrl(post.media.publicId, 1200)
    : deliveryUrl(post.media.publicId, 1400);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || !isVideo) return;
    const el = videoRef.current;
    if (!el) return;
    if (!paused) {
      el.muted = false;
      void el.play().catch(() => {
        el.muted = true;
        void el.play().catch(() => undefined);
      });
    } else {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [isVideo, paused]);

  return (
    <View
      style={[styles.page, Platform.OS === "web" ? ({ touchAction: "pan-y" } as object) : null]}
      testID={`feed-viewer-page-${post.id}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isVideo ? (paused ? "Play" : "Pause") : undefined}
        disabled={!isVideo}
        onPress={() => isVideo && setPaused((p) => !p)}
        style={styles.mediaFrame}
      >
        {isVideo && Platform.OS === "web"
          ? createElement("video", {
              ref: (el: HTMLVideoElement | null) => {
                videoRef.current = el;
              },
              src: videoUrl(post.media.publicId, 1080),
              controls: false,
              playsInline: true,
              "webkit-playsinline": "true",
              preload: "auto",
              loop: true,
              style: {
                width: "100%",
                height: "100%",
                objectFit: "contain",
                backgroundColor: "#000",
                pointerEvents: "none",
                touchAction: "pan-y",
              },
              "data-testid": "feed-viewer-video",
            })
          : imageUri
            ? (
                <Image
                  source={{ uri: imageUri }}
                  style={styles.image}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              )
            : null}
        {isVideo && paused ? (
          <View style={styles.centerPlay} pointerEvents="none">
            <Text style={styles.centerPlayIcon}>▶</Text>
          </View>
        ) : null}
      </Pressable>
      <View style={[styles.captionBar, { paddingBottom: Math.max(bottomInset, 16) }]} pointerEvents="none">
        {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
        <Text style={styles.meta}>
          {post.sitterName} · {formatFeedTime(post.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: "#000",
    },
    page: {
      flex: 1,
      backgroundColor: "#000",
      justifyContent: "center",
    },
    arrow: {
      position: "absolute",
      top: "50%",
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 4,
    },
    arrowLeft: { left: theme.spacing.sm },
    arrowRight: { right: theme.spacing.sm },
    mediaFrame: {
      flex: 1,
      width: "100%",
      justifyContent: "center",
      alignItems: "center",
    },
    image: {
      width: "100%",
      height: "100%",
    },
    captionBar: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.md,
      gap: theme.spacing.xs,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    caption: {
      fontSize: theme.fontSize.body,
      color: "#fff",
    },
    meta: {
      fontSize: theme.fontSize.small,
      color: "rgba(255,255,255,0.75)",
    },
    close: {
      position: "absolute",
      right: theme.spacing.md,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 4,
    },
    closeLabel: {
      color: "#fff",
      fontSize: 18,
      fontWeight: "600",
    },
    deleteBtn: {
      position: "absolute",
      left: theme.spacing.md,
      zIndex: 4,
      minHeight: 40,
      paddingHorizontal: theme.spacing.md,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.35)",
      alignItems: "center",
      justifyContent: "center",
    },
    deleteLabel: {
      color: theme.color.error,
      fontSize: theme.fontSize.body,
      fontWeight: "700",
    },
    centerPlay: {
      position: "absolute",
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    centerPlayIcon: {
      color: "#fff",
      fontSize: 22,
      marginLeft: 4,
    },
  });
