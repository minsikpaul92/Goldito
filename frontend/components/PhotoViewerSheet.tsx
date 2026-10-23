import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Sheet } from "./ui/Sheet";
import { deliveryUrl } from "../lib/cloudinary";
import type { ProfilePhoto } from "../features/profile/profilePhotosApi";
import { useThemedStyles } from "../providers/ThemeProvider";
import { Theme } from "../theme/themes";

type Props = {
  visible: boolean;
  title: string;
  photos: ProfilePhoto[];
  onClose: () => void;
  testID?: string;
};

/** A sideways drag this far (px) or this fast (px/ms) turns to the next photo. */
const TURN_DISTANCE = 50;
const TURN_VELOCITY = 0.4;
const WHEEL_STEP = 30;
const WHEEL_PAUSE_MS = 400;

/**
 * A person's or pet's photos, big, one at a time: drag or flick sideways, scroll the wheel sideways, or tap a dot
 * (a mouse works too). Pull the sheet's handle up for full screen.
 */
export function PhotoViewerSheet({ visible, title, photos, onClose, testID }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const slide = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const state = useRef({ index: 0, count: photos.length, width: 0, lastWheel: 0 });
  state.current.count = photos.length;
  state.current.width = width;

  // Closed means the next time opens on the first photo again.
  useEffect(() => {
    if (visible) return;
    state.current.index = 0;
    setIndex(0);
    slide.setValue(0);
    drag.setValue(0);
  }, [visible, slide, drag]);

  const go = (target: number) => {
    const next = Math.max(0, Math.min(state.current.count - 1, target));
    state.current.index = next;
    setIndex(next);
    Animated.parallel([
      Animated.timing(slide, { toValue: next, duration: 220, useNativeDriver: false }),
      Animated.timing(drag, { toValue: 0, duration: 220, useNativeDriver: false }),
    ]).start();
  };
  const goRef = useRef(go);
  goRef.current = go;

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only a mostly sideways drag takes over; up and down stays with the sheet.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => drag.setValue(g.dx),
        onPanResponderRelease: (_e, g) => {
          const at = state.current.index;
          if (g.dx < -TURN_DISTANCE || g.vx < -TURN_VELOCITY) goRef.current(at + 1);
          else if (g.dx > TURN_DISTANCE || g.vx > TURN_VELOCITY) goRef.current(at - 1);
          else goRef.current(at);
        },
        onPanResponderTerminate: () => goRef.current(state.current.index),
      }),
    [drag],
  );

  const onWheel = (e: { deltaX: number; deltaY: number; shiftKey?: boolean }) => {
    const dx = e.shiftKey && Math.abs(e.deltaX) < 1 ? e.deltaY : e.deltaX;
    const now = Date.now();
    if (Math.abs(dx) < WHEEL_STEP || now - state.current.lastWheel < WHEEL_PAUSE_MS) return;
    state.current.lastWheel = now;
    goRef.current(state.current.index + (dx > 0 ? 1 : -1));
  };

  const size = width || 320;
  const x = Animated.add(Animated.multiply(slide, -size), drag);

  return (
    <Sheet visible={visible} title={title} onClose={onClose} testID={testID}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View
          style={{ width: size, height: size, overflow: "hidden", borderRadius: 16 }}
          {...pan.panHandlers}
          {...(Platform.OS === "web" ? ({ onWheel, dataSet: { gestureOwner: "x" } } as object) : null)}
          testID={testID ? `${testID}-pager` : undefined}
        >
          <Animated.View style={{ flexDirection: "row", width: size * Math.max(1, photos.length), transform: [{ translateX: x }] }}>
            {photos.map((photo, i) => (
              <Image
                key={photo.id}
                source={{ uri: deliveryUrl(photo.publicId, 900) }}
                style={[styles.photo, { width: size, height: size }]}
                resizeMode="cover"
                accessibilityLabel={`${title}, photo ${i + 1}`}
                testID={testID ? `${testID}-photo-${i + 1}` : undefined}
              />
            ))}
          </Animated.View>
        </View>
        {photos.length > 1 ? (
          <View style={styles.dots}>
            {photos.map((photo, i) => (
              <Pressable
                key={photo.id}
                accessibilityRole="button"
                accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
                hitSlop={8}
                onPress={() => go(i)}
                style={[styles.dot, i === index && styles.dotOn]}
              />
            ))}
          </View>
        ) : null}
        {photos.length > 1 ? <Text style={styles.count}>{`${index + 1} of ${photos.length}, swipe for more`}</Text> : null}
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    photo: { backgroundColor: theme.color.border },
    dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: theme.spacing.sm },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.border },
    dotOn: { backgroundColor: theme.color.primary },
    count: { marginTop: theme.spacing.xs, textAlign: "center", fontSize: theme.fontSize.small, color: theme.color.textMuted },
  });
