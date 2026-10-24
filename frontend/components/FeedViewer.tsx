import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FeedTagIcon } from "./FeedTagIcon";
import { formatDay, formatTime, isoToZoned } from "../features/schedule/dates";
import { deliveryUrl, videoPosterUrl, videoUrl } from "../lib/cloudinary";
import { FEED_FILTERS, feedTags, type FeedTimelinePost } from "../lib/feed";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  visible: boolean;
  posts: FeedTimelinePost[];
  initialPostId: string | null;
  onClose: () => void;
  onNearEnd?: () => void;
  /** Parent opens a confirm sheet (outside this Modal) then deletes, from my Feed only or for both. */
  onRequestDelete?: (postId: string) => void;
  /** The author can edit their photo (tags, day, time, memo): the parent says for which, and opens the sheet. */
  canEdit?: (post: FeedTimelinePost) => boolean;
  onRequestEdit?: (postId: string) => void;
  /** Hide the photo from the grid / bring it back. */
  onHide?: (postId: string) => void;
  onUnhide?: (postId: string) => void;
};

const SWIPE_DISTANCE = 50;
/** A photo is zoomed from 1 (as shown) up to this; under ZOOM_REST it counts as not zoomed. */
const ZOOM_MAX = 4;
const ZOOM_REST = 1.02;
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/**
 * Instagram-style post viewer: full-screen, swipe, arrow keys or a tap on the left or right edge for prev/next; pinch
 * (or ctrl + wheel) zooms a photo and a finger moves it while it is zoomed.
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
  onRequestDelete,
  canEdit,
  onRequestEdit,
  onHide,
  onUnhide,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [activeId, setActiveId] = useState<string | null>(initialPostId);
  const nearEndSent = useRef(false);
  // The zoom of the photo on screen: while it is zoomed or being pinched a swipe moves the photo, not the viewer.
  const zoom = useRef({ scale: 1, pinching: false });
  const [zoomed, setZoomed] = useState(false);

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
          !zoom.current.pinching && zoom.current.scale <= ZOOM_REST && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -SWIPE_DISTANCE) goRef.current(1);
          else if (g.dx >= SWIPE_DISTANCE) goRef.current(-1);
        },
      }),
    [],
  );

  // A mouse swipe on the desktop: the browser's pointer events (a finger goes through the PanResponder above, so only
  // the mouse is handled here and a page never turns twice).
  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    let start: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      const free = !zoom.current.pinching && zoom.current.scale <= ZOOM_REST;
      start = e.pointerType === "mouse" && e.button === 0 && free ? { x: e.clientX, y: e.clientY } : null;
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerType !== "mouse") return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) goRef.current(dx < 0 ? 1 : -1);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
    };
  }, [visible]);

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

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      testID="feed-viewer"
    >
      {/* The viewer owns every drag here: inside the desktop phone frame the mouse is not turned into scrolling. */}
      <View
        style={styles.root}
        {...pan.panHandlers}
        {...(Platform.OS === "web" ? ({ dataSet: { gestureOwner: "true" } } as object) : null)}
      >
        <ViewerPage
          key={activePost.id}
          post={activePost}
          bottomInset={insets.bottom}
          zoom={zoom}
          onZoom={(scale) => setZoomed(scale > ZOOM_REST)}
        />

        {/* The left and right edges turn the page (no arrow buttons); not while a photo is zoomed. */}
        {!zoomed && index > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous"
            onPress={() => go(-1)}
            style={[styles.edge, styles.edgeLeft, { top: Math.max(insets.top, 12) + 56 }]}
            testID="feed-viewer-prev"
          />
        ) : null}
        {!zoomed && index < posts.length - 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next"
            onPress={() => go(1)}
            style={[styles.edge, styles.edgeRight, { top: Math.max(insets.top, 12) + 56 }]}
            testID="feed-viewer-next"
          />
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

        <View style={[styles.actions, { top: Math.max(insets.top, 12) }]}>
          {onHide && onUnhide ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => (activePost.hidden ? onUnhide(activePost.id) : onHide(activePost.id))}
              style={styles.actionBtn}
              testID="feed-viewer-hide"
            >
              <Text style={styles.actionLabel}>{activePost.hidden ? "Unhide" : "Hide"}</Text>
            </Pressable>
          ) : null}
          {onRequestEdit && canEdit?.(activePost) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit"
              onPress={() => onRequestEdit(activePost.id)}
              style={styles.actionBtn}
              testID="feed-viewer-edit"
            >
              <Text style={styles.actionLabel}>{"✏️ Edit"}</Text>
            </Pressable>
          ) : null}
          {onRequestDelete ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onRequestDelete(activePost.id)}
              style={styles.actionBtn}
              testID="feed-viewer-delete"
            >
              <Text style={[styles.actionLabel, styles.deleteLabel]}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

type ZoomState = { scale: number; pinching: boolean };

function ViewerPage({
  post,
  bottomInset,
  zoom,
  onZoom,
}: {
  post: FeedTimelinePost;
  bottomInset: number;
  zoom: { current: ZoomState };
  onZoom: (scale: number) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const tags = feedTags(post);
  const { day, time } = isoToZoned(post.takenAt);
  const isVideo = post.media.resourceType === "video";
  const imageUri = isVideo
    ? videoPosterUrl(post.media.publicId, 1200)
    : deliveryUrl(post.media.publicId, 1400);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(false);

  // Pinch zoom of a photo: two fingers scale it, one finger moves it while it is zoomed.
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const touch = useRef({ startDist: 0, startScale: 1, lastX: 0, lastY: 0 });
  // The viewer hands a new function every render: keep the latest in a ref so the effects below do not restart.
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const apply = useCallback(
    (next: { scale: number; x: number; y: number }) => {
      const scale = clamp(next.scale, 1, ZOOM_MAX);
      const room = (scale - 1) * 180; // how far the zoomed photo may be moved off centre
      const still = scale <= ZOOM_REST;
      setView({ scale: still ? 1 : scale, x: still ? 0 : clamp(next.x, -room, room), y: still ? 0 : clamp(next.y, -room, room) });
      zoom.current.scale = still ? 1 : scale;
      onZoomRef.current(still ? 1 : scale);
    },
    [zoom],
  );
  const viewRef = useRef(view);
  viewRef.current = view;
  const distance = (touches: ArrayLike<{ pageX: number; pageY: number }>) =>
    Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
  const zoomHandlers = isVideo
    ? {}
    : {
        onTouchStart: (e: { nativeEvent: { touches: ArrayLike<{ pageX: number; pageY: number }> } }) => {
          const t = e.nativeEvent.touches;
          if (t.length >= 2) {
            zoom.current.pinching = true;
            touch.current.startDist = distance(t);
            touch.current.startScale = viewRef.current.scale;
          } else if (t.length === 1) {
            touch.current.lastX = t[0].pageX;
            touch.current.lastY = t[0].pageY;
          }
        },
        onTouchMove: (e: { nativeEvent: { touches: ArrayLike<{ pageX: number; pageY: number }> } }) => {
          const t = e.nativeEvent.touches;
          const v = viewRef.current;
          if (t.length >= 2 && touch.current.startDist > 0) {
            apply({ ...v, scale: (touch.current.startScale * distance(t)) / touch.current.startDist });
          } else if (t.length === 1 && v.scale > ZOOM_REST) {
            apply({ ...v, x: v.x + t[0].pageX - touch.current.lastX, y: v.y + t[0].pageY - touch.current.lastY });
            touch.current.lastX = t[0].pageX;
            touch.current.lastY = t[0].pageY;
          }
        },
        onTouchEnd: (e: { nativeEvent: { touches: ArrayLike<{ pageX: number; pageY: number }> } }) => {
          const left = e.nativeEvent.touches.length;
          if (left < 2) {
            touch.current.startDist = 0;
            zoom.current.pinching = false;
          }
          if (left === 1) {
            touch.current.lastX = e.nativeEvent.touches[0].pageX;
            touch.current.lastY = e.nativeEvent.touches[0].pageY;
          }
        },
      };
  // A trackpad pinch (and ctrl + wheel) on the desktop: the browser sends a wheel event with ctrlKey.
  const layerRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || isVideo) return;
    const el = layerRef.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      apply({ ...viewRef.current, scale: viewRef.current.scale * Math.exp(-e.deltaY * 0.01) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    // A mouse moves a zoomed photo by dragging it (a finger does the same through the touch handlers above).
    let from: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && viewRef.current.scale > ZOOM_REST) from = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!from || e.pointerType !== "mouse") return;
      const v = viewRef.current;
      apply({ ...v, x: v.x + e.clientX - from.x, y: v.y + e.clientY - from.y });
      from = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      from = null;
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [apply, isVideo]);
  // Leaving the photo (the viewer closes or turns the page) puts the zoom back.
  useEffect(
    () => () => {
      zoom.current.scale = 1;
      zoom.current.pinching = false;
      onZoomRef.current(1);
    },
    [zoom],
  );

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
        testID="feed-viewer-media"
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
          : (
              <View
                ref={layerRef}
                style={[styles.zoomLayer, { transform: [{ translateX: view.x }, { translateY: view.y }, { scale: view.scale }] }]}
                testID="feed-viewer-zoom"
                {...zoomHandlers}
              >
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.image}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                  />
                ) : null}
              </View>
            )}
        {isVideo && paused ? (
          <View style={styles.centerPlay} pointerEvents="none">
            <Text style={styles.centerPlayIcon}>▶</Text>
          </View>
        ) : null}
      </Pressable>
      <View style={[styles.captionBar, { paddingBottom: Math.max(bottomInset, 16) }]} pointerEvents="none" testID="feed-viewer-info">
        {tags.length > 0 ? (
          <View style={styles.tagRow} testID="feed-viewer-tag">
            {tags.map((tag) => (
              <View key={tag} style={styles.tagPill}>
                <FeedTagIcon tag={tag} size={20} color={theme.color.text} />
                <Text style={styles.tagLabel}>{FEED_FILTERS.find((f) => f.key === tag)?.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {post.note ? (
          <Text style={styles.caption} testID="feed-viewer-note">
            {post.note}
          </Text>
        ) : post.captionSource === "ai" && post.caption ? (
          <Text style={styles.caption}>{post.caption}</Text>
        ) : null}
        <Text style={styles.meta} testID="feed-viewer-date">
          {`${formatDay(day)}, ${day.slice(0, 4)} · ${formatTime(time)}`}
        </Text>
        <Text style={styles.meta}>
          {post.authorName}
          {post.visibility === "private" ? " · Only you" : ""}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.media,
    },
    page: {
      flex: 1,
      backgroundColor: theme.color.media,
      justifyContent: "center",
    },
    // Invisible strips down both sides of the photo; the middle stays free for a video's play / pause.
    edge: { position: "absolute", bottom: 150, width: "22%", zIndex: 3 },
    edgeLeft: { left: 0 },
    edgeRight: { right: 0 },
    zoomLayer: { width: "100%", height: "100%" },
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
      color: theme.color.onMedia,
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
      color: theme.color.onMedia,
      fontSize: 18,
      fontWeight: theme.fontWeight.semibold,
    },
    actions: {
      position: "absolute",
      left: theme.spacing.md,
      zIndex: 4,
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    actionBtn: {
      minHeight: 40,
      paddingHorizontal: theme.spacing.md,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.35)",
      alignItems: "center",
      justifyContent: "center",
    },
    actionLabel: {
      color: theme.color.onMedia,
      fontSize: theme.fontSize.body,
      fontWeight: theme.fontWeight.bold,
    },
    deleteLabel: {
      color: theme.color.error,
    },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    tagPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingLeft: 4,
      paddingRight: 10,
      paddingVertical: 3,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.color.surface,
    },
    tagLabel: {
      fontSize: theme.fontSize.small,
      fontWeight: theme.fontWeight.bold,
      color: theme.color.text,
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
      color: theme.color.onMedia,
      fontSize: 22,
      marginLeft: 4,
    },
  });
