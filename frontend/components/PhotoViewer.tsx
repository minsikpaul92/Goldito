import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { deliveryUrl } from "../lib/cloudinary";
import type { ProfilePhoto } from "../features/profile/profilePhotosApi";
import { Icon } from "./ui/Icon";
import { useTheme, useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  visible: boolean;
  photos: ProfilePhoto[];
  /** The photo it opens on (0 = the cover). */
  initialIndex?: number;
  onClose: () => void;
};

const SWIPE_DISTANCE = 50;

/**
 * Full-screen photo viewer for a person's profile photos (#136): swipe, the arrow buttons or the arrow keys move
 * through them, Escape or ✕ closes. Same pattern as FeedViewer, without video or captions.
 */
export function PhotoViewer({ visible, photos, initialIndex = 0, onClose }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  // Open on the requested photo each time the viewer opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (visible) setIndex(initialIndex);
  }

  const last = photos.length - 1;
  const current = Math.max(0, Math.min(last, index));
  const go = (delta: number) => setIndex((i) => Math.max(0, Math.min(last, i + delta)));
  const goRef = useRef(go);
  goRef.current = go;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
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
      else if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  const photo = photos[current];
  if (!visible || !photo) return null;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root} {...pan.panHandlers} testID="photo-viewer">
        <Image
          key={photo.id}
          source={{ uri: deliveryUrl(photo.publicId, 1400) }}
          style={styles.image}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          testID={`photo-viewer-photo-${photo.id}`}
        />

        {current > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous photo"
            onPress={() => go(-1)}
            style={[styles.round, styles.arrowLeft]}
            testID="photo-viewer-prev"
          >
            <Text style={styles.icon}>‹</Text>
          </Pressable>
        ) : null}
        {current < last ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next photo"
            onPress={() => go(1)}
            style={[styles.round, styles.arrowRight]}
            testID="photo-viewer-next"
          >
            <Text style={styles.icon}>›</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[styles.round, styles.close, { top: Math.max(insets.top, 12) }]}
          testID="photo-viewer-close"
        >
          <Icon name="close" size={24} color={theme.color.onMedia} />
        </Pressable>

        {photos.length > 1 ? (
          <Text style={[styles.count, { bottom: Math.max(insets.bottom, 16) }]} testID="photo-viewer-count">
            {`${current + 1} / ${photos.length}`}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.color.media,
      justifyContent: "center",
    },
    image: {
      width: "100%",
      height: "100%",
    },
    round: {
      position: "absolute",
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 4,
    },
    arrowLeft: { top: "50%", left: theme.spacing.sm },
    arrowRight: { top: "50%", right: theme.spacing.sm },
    // ✕ top left, labelled Close, like the feed viewer (U4).
    close: { left: theme.spacing.md },
    icon: {
      color: theme.color.onMedia,
      fontSize: 18,
      fontWeight: theme.fontWeight.semibold,
    },
    count: {
      position: "absolute",
      alignSelf: "center",
      color: theme.color.onMedia,
      fontSize: theme.fontSize.small,
    },
  });
