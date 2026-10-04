import { createElement, useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
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

/**
 * Instagram-style post viewer: full-screen, horizontal swipe for prev/next.
 * Uses ScrollView + contentOffset (not FlatList) so web opens on the tapped post —
 * FlatList initialScrollIndex / scrollToOffset was stuck at index 0, so photos
 * opened the first video and viewability flipped activeId to that video.
 * (5.10: open-at-index still flaky on Expo web Safari — tracked in TODO.)
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
  const scrollRef = useRef<ScrollView>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [activeId, setActiveId] = useState<string | null>(initialPostId);
  const nearEndSent = useRef(false);
  const settling = useRef(false);

  const startIndex = Math.max(
    0,
    initialPostId ? posts.findIndex((p) => p.id === initialPostId) : 0,
  );
  const { width, height } = pageSize;
  const ready = width > 0 && height > 0;

  useEffect(() => {
    if (!visible) {
      nearEndSent.current = false;
      settling.current = false;
      return;
    }
    setActiveId(initialPostId);
  }, [visible, initialPostId]);

  // RN Web often ignores contentOffset on mount — force the tapped page.
  useEffect(() => {
    if (!visible || !ready || !initialPostId) return;
    const x = startIndex * width;
    settling.current = true;
    setActiveId(posts[startIndex]?.id ?? initialPostId);
    // Double rAF: wait for ScrollView children to lay out on web.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x, y: 0, animated: false });
        setTimeout(() => {
          settling.current = false;
        }, 50);
      });
    });
  }, [visible, ready, initialPostId, startIndex, width, posts]);

  const indexFromOffset = useCallback(
    (offsetX: number) =>
      Math.max(0, Math.min(posts.length - 1, Math.round(offsetX / Math.max(width, 1)))),
    [posts.length, width],
  );

  const syncActive = useCallback(
    (offsetX: number) => {
      const index = indexFromOffset(offsetX);
      const id = posts[index]?.id;
      if (id) setActiveId(id);
      if (onNearEnd && !nearEndSent.current && index >= posts.length - 2) {
        nearEndSent.current = true;
        onNearEnd();
      }
    },
    [indexFromOffset, onNearEnd, posts],
  );

  const snapToNearest = useCallback(
    (offsetX: number) => {
      if (!ready || settling.current) return;
      const index = indexFromOffset(offsetX);
      settling.current = true;
      scrollRef.current?.scrollTo({ x: index * width, y: 0, animated: true });
      syncActive(index * width);
      setTimeout(() => {
        settling.current = false;
      }, 280);
    },
    [indexFromOffset, ready, syncActive, width],
  );

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    snapToNearest(e.nativeEvent.contentOffset.x);
  };

  if (!visible || !initialPostId || posts.length === 0) return null;

  const activePost = posts.find((p) => p.id === activeId) ?? posts[startIndex];
  // Parent only wires onRequestDelete for authors (sitter feed). RLS still blocks non-authors.
  const canDelete = !!onRequestDelete && !!activePost;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      testID="feed-viewer"
    >
      <View
        style={styles.root}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (w !== pageSize.width || h !== pageSize.height) {
            setPageSize({ width: w, height: h });
          }
        }}
      >
        {ready ? (
          <ScrollView
            key={`viewer-${initialPostId}-${width}`}
            ref={scrollRef}
            horizontal
            pagingEnabled
            bounces={false}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            // Critical on web: open on the tapped page (FlatList ignored this).
            contentOffset={{ x: startIndex * width, y: 0 }}
            onMomentumScrollEnd={onScrollEnd}
            onScrollEndDrag={onScrollEnd}
            onScroll={(e) => {
              // Keep active in sync while dragging so the wrong video never autoplays.
              if (!settling.current) syncActive(e.nativeEvent.contentOffset.x);
            }}
            scrollEventThrottle={16}
            style={{ width, height }}
            contentContainerStyle={{ height }}
          >
            {posts.map((item) => (
              <ViewerPage
                key={item.id}
                post={item}
                height={height}
                width={width}
                active={item.id === activeId}
                bottomInset={insets.bottom}
              />
            ))}
          </ScrollView>
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

        {canDelete && activePost ? (
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

function ViewerPage({
  post,
  height,
  width,
  active,
  bottomInset,
}: {
  post: FeedTimelinePost;
  height: number;
  width: number;
  active: boolean;
  bottomInset: number;
}) {
  const styles = useThemedStyles(makeStyles);
  const isVideo = post.media.resourceType === "video";
  const imageUri = isVideo
    ? videoPosterUrl(post.media.publicId, 1200)
    : deliveryUrl(post.media.publicId, 1400);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setPaused(false);
  }, [post.id]);

  useEffect(() => {
    if (Platform.OS !== "web" || !isVideo) return;
    const el = videoRef.current;
    if (!el) return;
    if (active && !paused) {
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
  }, [active, isVideo, paused, post.id]);

  return (
    <View
      style={[styles.page, { height, width }, Platform.OS === "web" ? ({ touchAction: "pan-x" } as object) : null]}
      testID={`feed-viewer-page-${post.id}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isVideo ? (paused ? "Play" : "Pause") : undefined}
        disabled={!isVideo}
        onPress={() => isVideo && setPaused((p) => !p)}
        style={styles.mediaFrame}
      >
        {isVideo && Platform.OS === "web" && active
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
                touchAction: "pan-x",
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
      backgroundColor: "#000",
      justifyContent: "center",
    },
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
